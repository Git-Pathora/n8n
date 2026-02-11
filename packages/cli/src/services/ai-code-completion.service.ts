import { GlobalConfig } from '@n8n/config';
import { Service } from '@n8n/di';
import type { AiCodeCompletionRequestDto } from '@n8n/api-types';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';

interface CodestralFimResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
}

const BASE_CONTEXT = `/* n8n Code Node — JavaScript (ES6 only).
RULES:
- Do NOT use require(), import, fetch(), or external libraries.
- For HTTP calls use helpers.httpRequest() instead of fetch().
- Only console.log() works (no warn/error/info). Use async/await for promises.
- Prefer .map(), .filter(), .reduce() over imperative loops.
- NEVER use optional chaining (?.) on the LEFT side of assignments.
  CORRECT: item.json.prop = value   WRONG: item?.json?.prop = value
- The final return of the Code node must be an object or array of objects, never a raw primitive.
  Inner functions/closures can return any type.

DATA MODEL:
  Items are ALWAYS wrapped: { json: { ...data }, binary?: { propName: {...} } }
  Access data via item.json.fieldName — NEVER item.fieldName directly.
  Items from $("NodeName").all() are also wrapped the same way — use otherItem.json.field.

GLOBALS:
  $input          - Current node's input data
  $execution      - { id, mode: 'test'|'production', resumeUrl, resumeFormUrl, customData }
  $execution.customData - { set(k,v), get(k), setAll(obj), getAll() }
  $workflow       - { id, name, active }
  $prevNode       - { name, outputIndex, runIndex }
  $env            - Environment variables: $env.MY_VAR
  $vars           - Workflow variables: $vars.myVar
  $now            - Luxon DateTime (current time)
  $today          - Luxon DateTime (midnight today)
  $runIndex       - Current run index (number)
  $mode           - Execution mode ('manual', 'trigger', 'webhook', etc.)
  $nodeVersion    - Node type version (number)
  $nodeId         - Node ID (string)
  $parameter      - Current node's parameters
  $jmespath(data, expr) - JMESPath query
  $if(cond, trueVal, falseVal) - Conditional
  $ifEmpty(val, fallback) - Return fallback if val is empty
  $min(...nums), $max(...nums) - Math min/max
  $evaluateExpression(expr) - Evaluate n8n expression string
  $getWorkflowStaticData('global'|'node') - Persistent data across executions
  DateTime, Duration, Interval - Luxon classes (global)
  Buffer, setTimeout, setInterval, btoa, atob, FormData, TextEncoder, TextDecoder

  $("NodeName")   - Access other node's data (returns wrapped items with .json):
    .all(branch?, run?)    - All items from that node
    .first(branch?, run?)  - First item
    .last(branch?, run?)   - Last item
    .item                  - Paired/matched item
    .itemMatching(index)   - Item at index
    .params, .context, .isExecuted

  helpers.httpRequest(opts) - HTTP requests:
    opts: { url, method?, headers?, body?, qs?, returnFullResponse?, timeout?,
            skipSslCertificateValidation?, ignoreHttpStatusErrors?, encoding? }
  helpers.getBinaryDataBuffer(itemIndex, propName) -> Promise<Buffer>
  helpers.prepareBinaryData(buffer, fileName?, mimeType?) -> Promise<BinaryData>
  helpers.setBinaryDataBuffer(metadata, buffer) -> Promise<BinaryData>
  helpers.binaryToString(buffer, encoding?) -> Promise<string>

EXTENSION METHODS (call on values directly):
  String:  .toNumber(), .toBoolean(), .toDateTime(fmt?), .toInt(), .toFloat(),
           .hash(algo?), .base64Encode(), .base64Decode(), .urlEncode(), .urlDecode(),
           .removeTags(), .removeMarkdown(), .replaceSpecialChars(),
           .extractEmail(), .extractDomain(), .extractUrl(), .extractUrlPath(),
           .isEmpty(), .isNotEmpty(), .isEmail(), .isUrl(), .isDomain(), .isNumeric(),
           .toTitleCase(), .toSentenceCase(), .toSnakeCase(), .parseJson(), .quote()
  Number:  .round(dp?), .floor(), .ceil(), .abs(), .format(locale?, opts?),
           .isEven(), .isOdd(), .isInteger(), .toBoolean(), .toDateTime(fmt?)
  Array:   .first(), .last(), .pluck(...keys), .unique(...keys), .randomItem(),
           .compact(), .chunk(size), .renameKeys(from, to, ...), .smartJoin(keyF, valF),
           .merge(other?), .union(other), .difference(other), .intersection(other),
           .sum(), .min(), .max(), .average(), .isEmpty(), .isNotEmpty(), .append(...items)
  Object:  .isEmpty(), .isNotEmpty(), .hasField(name), .removeField(key),
           .removeFieldsContaining(str), .keepFieldsContaining(str),
           .compact(), .urlEncode(), .keys(), .values()
  Date/DateTime: .plus(n, unit), .minus(n, unit), .beginningOf(unit), .endOfMonth(),
           .extract(part), .format(fmt), .isBetween(d1, d2), .isDst(), .isInLast(n, unit),
           .isWeekend(), .diffTo(date, unit), .diffToNow(unit), .toDateTime()
*/
`;

const ALL_ITEMS_CONTEXT = `${BASE_CONTEXT}/* MODE: Run Once for All Items
  $input.all()      - All input items as array of { json, binary? }
  $input.first()    - First input item
  $input.last()     - Last input item
  $input.itemMatching(idx) - Input item at index

  RETURN: Array of objects. Each either:
    - Plain object: { name: "x", value: 1 } (auto-wrapped in json)
    - Explicit:     { json: { name: "x" }, binary?: { file: binaryData } }
    - Return null for empty output.
  When reducing many items to fewer, add pairedItem for lineage:
    { json: {...}, pairedItem: [0, 1, 2] }

  EXAMPLE:
  return $input.all().map(item => ({
    name: item.json.name,
    email: item.json.email,
  }));
*/
`;

const EACH_ITEM_CONTEXT = `${BASE_CONTEXT}/* MODE: Run Once for Each Item
  $input.item       - Current input item { json, binary? }
  $json             - Shorthand for $input.item.json (current item's JSON data)
  $binary           - Shorthand for $input.item.binary
  $itemIndex        - Index of the current item (number)

  CANNOT use: $input.all(), $input.first(), $input.last(), $input.itemMatching()

  When modifying the current item: $input.item.json.newField = value (no ?. on left side).

  RETURN: Single object (NOT an array). Either:
    - Plain object: { name: "x", value: 1 } (auto-wrapped in json)
    - Explicit:     { json: { name: "x" }, binary?: { file: binaryData } }
    - Return null to skip/filter out this item.

  EXAMPLE:
  return {
    name: $json.name.toUpperCase(),
    email: $json.email,
    isRecent: $json.createdAt.toDateTime().isInLast(7, 'days'),
  };
*/
`;

@Service()
export class AiCodeCompletionService {
	private readonly apiKey: string;

	constructor(globalConfig: GlobalConfig) {
		this.apiKey = globalConfig.ai.codestralApiKey;
	}

	async getCompletion(payload: AiCodeCompletionRequestDto): Promise<{ completion: string }> {
		if (!this.apiKey) {
			throw new BadRequestError(
				'Codestral API key not configured. Set N8N_AI_CODESTRAL_API_KEY environment variable.',
			);
		}

		const contextPrefix = this.getContextPrefix(payload.mode, payload.inputSchema);

		const response = await fetch('https://api.mistral.ai/v1/fim/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: 'codestral-2508',
				prompt: contextPrefix + payload.codeBeforeCursor,
				suffix: payload.codeAfterCursor ?? '',
				max_tokens: 150,
				temperature: 0,
				stop: ['\n\n'],
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new BadRequestError(`Codestral API error: ${response.status} ${errorText}`);
		}

		const data = (await response.json()) as CodestralFimResponse;
		const completion = data.choices?.[0]?.message?.content ?? '';

		return { completion };
	}

	private getContextPrefix(mode?: string, inputSchema?: string): string {
		let prefix = mode === 'runOnceForEachItem' ? EACH_ITEM_CONTEXT : ALL_ITEMS_CONTEXT;

		if (inputSchema) {
			prefix += `/* INPUT SCHEMA (available on item.json):\n  ${inputSchema}\n*/\n`;
		}

		return prefix;
	}
}
