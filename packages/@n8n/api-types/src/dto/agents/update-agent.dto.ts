import { z } from 'zod';

import { Z } from '../../zod-class';

export class UpdateAgentDto extends Z.class({
	firstName: z.string().min(1).max(32).optional(),
	avatar: z.string().max(255).nullable().optional(),
}) {}
