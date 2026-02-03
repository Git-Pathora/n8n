## How the AI Agent Node Works in n8n

### The Big Picture

The AI Agent node is different from regular n8n nodes. Instead of just processing data, it **orchestrates an AI-driven conversation loop** that can use tools, remember context, and generate intelligent responses.

Here's a visual representation of the architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agent Node                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     Inputs (Connections)                    ││
│  │                                                             ││
│  │   ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────────────┐ ││
│  │   │  Model   │  │  Memory  │  │ Tools  │  │Output Parser  │ ││
│  │   │(required)│  │(optional)│  │(0..n)  │  │  (optional)   │ ││
│  │   └────┬─────┘  └────┬─────┘  └───┬────┘  └───────┬───────┘ ││
│  └────────│─────────────│────────────│───────────────│─────────┘│
│           │             │            │               │          │
│           ▼             ▼            ▼               ▼          │
│  ┌──────────────────────────────────────────────────────────────┐
│  │                    execute() method                          │
│  │                                                              │
│  │  1. Build context (get model, memory, tools from inputs)     │
│  │  2. Prepare prompt with chat history                         │
│  │  3. Invoke LangChain agent                                   │
│  │  4. If tools needed → return EngineRequest                   │
│  │  5. If done → return final output                            │
│  └──────────────────────────────────────────────────────────────┘
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Key Concepts

#### 1. Two Types of Node Functions

Regular n8n nodes typically have an `execute()` function. But AI-related "sub-nodes" (like models, memory, tools) use a **different function called `supplyData()`**:

| Node Type | Function | Purpose |
|-----------|----------|---------|
| AI Agent | `execute()` | Orchestrates the AI conversation |
| Chat Model | `supplyData()` | Returns a LangChain model instance |
| Memory | `supplyData()` | Returns a memory storage instance |
| Tool | `supplyData()` | Returns a callable tool object |

#### 2. How Connections Work

The Agent node declares special input types in `utils.ts`:

```typescript:14:82:packages/@n8n/nodes-langchain/nodes/agents/Agent/utils.ts
export function getInputs(
  hasMainInput?: boolean,
  hasOutputParser?: boolean,
  needsFallback?: boolean,
): Array<NodeConnectionType | INodeInputConfiguration> {
  // ...
  let specialInputs: SpecialInput[] = [
    {
      type: 'ai_languageModel',   // Chat Model connection
      displayName: 'Chat Model',
      required: true,
    },
    {
      type: 'ai_memory',          // Memory connection
      displayName: 'Memory',
    },
    {
      type: 'ai_tool',            // Tool connections (multiple allowed)
      displayName: 'Tool',
    },
    {
      type: 'ai_outputParser',    // Output parser connection
      displayName: 'Output Parser',
    },
  ];
  // ...
}
```

These aren't regular `main` connections - they're special AI connection types that tell n8n these nodes provide AI capabilities, not data.

---

### The Execution Flow

Here's how execution works step by step:

#### Step 1: Agent Gets Its Dependencies

When the Agent's `execute()` runs, it fetches connected sub-nodes using `getInputConnectionData()`:

```typescript:341:381:packages/@n8n/nodes-langchain/nodes/agents/Agent/agents/ToolsAgent/common.ts
// Get the chat model
export async function getChatModel(ctx, index = 0) {
  const connectedModels = await ctx.getInputConnectionData(
    NodeConnectionTypes.AiLanguageModel, 0
  );
  // Returns the LangChain model instance from the sub-node
  return model as BaseChatModel;
}

// Get memory (if connected)
export async function getOptionalMemory(ctx) {
  return await ctx.getInputConnectionData(NodeConnectionTypes.AiMemory, 0);
}

// Get all connected tools
export async function getTools(ctx, outputParser?) {
  const tools = await getConnectedTools(ctx, true, false);
  return tools;
}
```

**What happens under the hood:** When n8n calls `getInputConnectionData()`, it triggers the `supplyData()` method on the connected sub-node. So the model node's `supplyData()` returns a LangChain `ChatOpenAI` instance, the memory node returns a `BufferWindowMemory`, etc.

#### Step 2: Build the Agent Executor

The agent creates a LangChain "agent executor" - a runnable chain that:
1. Takes user input
2. Calls the LLM with the system prompt and chat history
3. Detects if the LLM wants to call tools
4. Executes tools and feeds results back to the LLM
5. Repeats until the LLM produces a final answer

#### Step 3: The Tool Calling Loop (The Interesting Part!)

This is where n8n's architecture is clever. When the AI model decides to call a tool:

1. **Agent detects tool call** - The LLM returns tool call instructions
2. **Agent returns an `EngineRequest`** - Instead of executing the tool directly, the Agent node returns a special request to the n8n engine:

```typescript:190:248:packages/@n8n/nodes-langchain/utils/agent-execution/createEngineRequests.ts
export function createEngineRequests(
  toolCalls,
  itemIndex,
  tools,
): EngineRequest['actions'] {
  return toolCalls.map((toolCall) => {
    const foundTool = tools.find((tool) => tool.name === toolCall.tool);
    const nodeName = foundTool.metadata?.sourceNodeName;
    
    return {
      actionType: 'ExecutionNodeAction',
      nodeName,           // The tool node's name
      input: toolInput,   // Arguments for the tool
      type: NodeConnectionTypes.AiTool,
      id: toolCall.toolCallId,
    };
  });
}
```

3. **n8n Engine executes the tool node** - The engine runs the tool node's code
4. **Engine calls Agent again** with `response` parameter containing tool results
5. **Agent feeds results to LLM** and continues the conversation

```typescript:135:140:packages/@n8n/nodes-langchain/nodes/agents/Agent/V3/AgentV3.node.ts
async execute(
  this: IExecuteFunctions,
  response?: EngineResponse<RequestResponseMetadata>,  // Tool results come here!
): Promise<INodeExecutionData[][] | EngineRequest<RequestResponseMetadata>> {
  return await toolsAgentExecute.call(this, response);
}
```

---

### How Each Sub-Node Works

#### Chat Model (e.g., OpenAI)

```typescript
async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
  const model = new ChatOpenAI({
    apiKey: credentials.apiKey,
    model: 'gpt-4',
    // ... other options
  });
  
  return {
    response: model,  // Returns a LangChain model instance
  };
}
```

The model node doesn't process data - it just **provides a configured LangChain model** that the Agent will use.

#### Memory Node

```typescript:153:179:packages/@n8n/nodes-langchain/nodes/memory/MemoryBufferWindow/MemoryBufferWindow.node.ts
async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
  const memory = await memoryInstance.getMemory(`${workflowId}__${sessionId}`, {
    k: contextWindowLength,
    // ...
  });

  return {
    response: logWrapper(memory, this),  // Returns a memory instance
  };
}
```

The Agent loads chat history from this memory before each LLM call and saves the conversation after.

#### Tool Node (e.g., Code Tool)

```typescript:342:346:packages/@n8n/nodes-langchain/nodes/tools/ToolCode/ToolCode.node.ts
async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
  return {
    response: getTool(this, itemIndex),  // Returns a LangChain Tool
  };
}
```

The tool is described to the LLM (name + description + schema). When the LLM decides to use it, n8n executes the tool's code and returns the result.

---

### Summary Diagram

```
User Prompt
     │
     ▼
┌────────────────┐
│   AI Agent     │◄───── Model (via supplyData)
│                │◄───── Memory (via supplyData)  
│                │◄───── Tools (via supplyData)
└───────┬────────┘
        │
        ▼
   ┌─────────────┐
   │  LLM Call   │──── "I need to use Calculator tool"
   └─────────────┘
        │
        ▼
   ┌─────────────────────┐
   │  Return EngineRequest  │──► n8n Engine executes tool node
   └─────────────────────┘
        │
        ◄──── Tool result
        │
        ▼
   ┌─────────────┐
   │  LLM Call   │──── "Based on the calculation, the answer is..."
   └─────────────┘
        │
        ▼
   Return final output
```

The key insight is that **the Agent node can pause and resume**. It returns control to the n8n engine when tools need to be executed, then continues when results come back. This allows complex multi-step AI reasoning while keeping tool execution within n8n's standard node system.
