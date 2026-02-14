import { inDevelopment } from '@n8n/backend-common';
import type { RequestHandler } from 'express';

const ALLOWED_ORIGINS = process.env.N8N_CORS_ORIGIN
	? process.env.N8N_CORS_ORIGIN.split(',').map((o) => o.trim())
	: [];

export const corsMiddleware: RequestHandler = (req, res, next) => {
	const origin = req.headers.origin;
	if (origin) {
		const isAllowed = inDevelopment || ALLOWED_ORIGINS.includes(origin);
		if (isAllowed) {
			res.header('Access-Control-Allow-Origin', origin);
			res.header('Access-Control-Allow-Credentials', 'true');
			res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
			res.header(
				'Access-Control-Allow-Headers',
				'Origin, X-Requested-With, Content-Type, Accept, push-ref, browser-id, anonymousid, authorization, x-authorization',
			);
		}
	}

	if (req.method === 'OPTIONS') {
		res.writeHead(204).end();
	} else {
		next();
	}
};
