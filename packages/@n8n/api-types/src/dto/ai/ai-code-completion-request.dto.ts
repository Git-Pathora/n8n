import { z } from 'zod';

import { Z } from '../../zod-class';

export class AiCodeCompletionRequestDto extends Z.class({
	codeBeforeCursor: z.string(),
	codeAfterCursor: z.string().optional().default(''),
	language: z.enum(['javaScript', 'python']),
	mode: z.enum(['runOnceForAllItems', 'runOnceForEachItem']).optional(),
}) {}
