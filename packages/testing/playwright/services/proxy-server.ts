/**
 * ProxyServer service helper functions for Playwright tests
 */

import crypto from 'crypto';
import { promises as fs } from 'fs';
import type { Expectation, RequestDefinition } from 'mockserver-client';
import { mockServerClient as proxyServerClient } from 'mockserver-client';
import type { HttpRequest, HttpResponse } from 'mockserver-client/mockServer';
import type {
	MockServerClient,
	PathOrRequestDefinition,
	RequestResponse,
} from 'mockserver-client/mockServerClient';
import { join } from 'path';

export type RequestMade = {
	httpRequest?: HttpRequest;
	httpResponse?: HttpResponse;
	timestamp?: string;
};

export interface ProxyServerRequest {
	method: string;
	path: string;
	queryStringParameters?: Record<string, string[]>;
	headers?: Record<string, string[]>;
	body?: string | { type?: string; [key: string]: unknown };
}

export interface ProxyServerResponse {
	statusCode: number;
	headers?: Record<string, string[]>;
	body?: string;
	delay?: {
		timeUnit: 'MICROSECONDS' | 'MILLISECONDS' | 'SECONDS' | 'MINUTES';
		value: number;
	};
}

export interface ProxyServerExpectation {
	httpRequest: ProxyServerRequest;
	httpResponse: ProxyServerResponse;
	times?: {
		remainingTimes?: number;
		unlimited?: boolean;
	};
}

export interface RequestLog {
	method: string;
	path: string;
	headers: Record<string, string[]>;
	queryStringParameters?: Record<string, string[]>;
	body?: string;
	timestamp: string;
}

export class ProxyServer {
	private client: MockServerClient;
	url: string;
	private expectationsDir = './expectations';

	/**
	 * Create a ProxyServer client instance from a URL
	 */
	constructor(proxyServerUrl: string) {
		this.url = proxyServerUrl;
		const parsedURL = new URL(proxyServerUrl);
		this.client = proxyServerClient(parsedURL.hostname, parseInt(parsedURL.port, 10));
	}

	/**
	 * Load all expectations from the specified subfolder and mock them
	 */
	/**
	 * Check if a string contains UUIDs
	 */
	private hasUUIDs(value: string): boolean {
		const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
		return UUID_REGEX.test(value);
	}

	/**
	 * Strip UUID-containing fields from messages array to enable matching on stable fields only
	 */
	private stripUUIDFields(messages: unknown[]): unknown[] {
		return messages.map((msg: any) => {
			if (!msg || typeof msg !== 'object') return msg;

			// Keep only role and filter content
			const filtered: any = { role: msg.role };

			// For content, check each item and keep only non-UUID content
			if (Array.isArray(msg.content)) {
				filtered.content = msg.content
					.map((item: any) => {
						// Keep text content that doesn't have UUIDs
						if (item.type === 'text' && typeof item.text === 'string') {
							return !this.hasUUIDs(item.text) ? item : null;
						}
						// Keep tool_use (these are from AI responses, stable)
						if (item.type === 'tool_use') {
							return item;
						}
						// For tool_result, check if content has UUIDs
						if (item.type === 'tool_result') {
							const contentStr =
								typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
							// Only keep if content doesn't have UUIDs
							if (!this.hasUUIDs(contentStr)) {
								// Return tool_result but without tool_use_id (that's from AI response, should be stable)
								return {
									type: 'tool_result',
									content: item.content,
								};
							}
						}
						return null;
					})
					.filter((item: any) => item !== null);
			} else if (typeof msg.content === 'string') {
				// Keep string content if it doesn't have UUIDs
				if (!this.hasUUIDs(msg.content)) {
					filtered.content = msg.content;
				}
			}

			return filtered;
		});
	}

	async loadExpectations(
		folderName: string,
		options: { strictBodyMatching?: boolean; sequentialMatching?: boolean } = {},
	): Promise<void> {
		try {
			const targetDir = join(this.expectationsDir, folderName);
			const files = await fs.readdir(targetDir);
			// Sort files by name (timestamp prefix ensures chronological order)
			const jsonFiles = files.filter((file) => file.endsWith('.json')).sort();
			const expectations: Expectation[] = [];

			for (let i = 0; i < jsonFiles.length; i++) {
				const file = jsonFiles[i];
				try {
					const filePath = join(targetDir, file);
					const fileContent = await fs.readFile(filePath, 'utf8');
					const expectation = JSON.parse(fileContent);

					if (options.strictBodyMatching && expectation.httpRequest?.body) {
						expectation.httpRequest.body.matchType = 'STRICT';
					}

					if (options.sequentialMatching) {
						// Strip UUID-containing fields from request body for matching
						if (expectation.httpRequest?.body?.json?.messages) {
							expectation.httpRequest.body.json.messages = this.stripUUIDFields(
								expectation.httpRequest.body.json.messages,
							);
						}

						// Use ONLY_MATCHING_FIELDS - now that we've stripped UUID fields,
						// matching will work on stable fields only (model, tools, system, filtered messages)
						if (expectation.httpRequest?.body) {
							expectation.httpRequest.body.matchType = 'ONLY_MATCHING_FIELDS';
						}

						// Set priority based on file order (earlier files = higher priority)
						// Combined with times:1, this ensures sequential matching
						expectation.priority = jsonFiles.length - i;

						// Each expectation should only match once (in order)
						expectation.times = { remainingTimes: 1, unlimited: false };
					}

					expectations.push(expectation);
				} catch (parseError) {
					console.log(`Error parsing expectation from ${file}:`, parseError);
				}
			}

			if (expectations.length > 0) {
				console.log('Loading expectations:', expectations.length);
				await this.client.mockAnyResponse(expectations);
			}
		} catch (error) {
			console.log('Error loading expectations:', error);
		}
	}

	/**
	 * Create an expectation in ProxyServer
	 */
	async createExpectation(expectation: ProxyServerExpectation): Promise<RequestResponse> {
		try {
			return await this.client.mockAnyResponse({
				httpRequest: expectation.httpRequest,
				httpResponse: expectation.httpResponse,
				times: expectation.times,
			});
		} catch (error) {
			throw new Error(
				`Failed to create expectation: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Verify that a request was received by ProxyServer
	 */
	async verifyRequest(request: RequestDefinition, numberOfRequests: number): Promise<boolean> {
		try {
			await this.client.verify(request, numberOfRequests, numberOfRequests);
			return true;
		} catch (error) {
			console.log('error', error);
			return false;
		}
	}

	/**
	 * Clear all expectations and logs from ProxyServer
	 */
	async clearAllExpectations(): Promise<void> {
		try {
			await this.client.clear('', 'ALL');
		} catch (error) {
			throw new Error(`Failed to clear ProxyServer: ${JSON.stringify(error)}`);
		}
	}

	/**
	 * Create a request expectation with JSON response
	 */
	async createGetExpectation(
		path: string,
		responseBody: unknown,
		queryParams?: Record<string, string>,
		statusCode: number = 200,
	): Promise<RequestResponse> {
		const queryStringParameters = queryParams
			? Object.entries(queryParams).reduce<Record<string, string[]>>((acc, [key, value]) => {
					acc[key] = [value];
					return acc;
				}, {})
			: undefined;

		return await this.createExpectation({
			httpRequest: {
				method: 'GET',
				path,
				...(queryStringParameters && { queryStringParameters }),
			},
			httpResponse: {
				statusCode,
				headers: {
					'Content-Type': ['application/json'],
				},
				body: JSON.stringify(responseBody),
			},
		});
	}

	/**
	 * Verify a request was made to ProxyServer
	 */
	async wasRequestMade(request: RequestDefinition, numberOfRequests = 1): Promise<boolean> {
		return await this.verifyRequest(request, numberOfRequests);
	}

	async getAllRequestsMade(): Promise<RequestMade[]> {
		// @ts-expect-error mockserver types seem to be messed up
		return await this.client.retrieveRecordedRequestsAndResponses('');
	}

	/**
	 * Retrieve recorded expectations and write to files
	 *
	 * @param folderName - Target folder name for saving expectation files
	 * @param options - Optional configuration
	 * @param options.pathOrRequestDefinition - Filter expectations by path or request definition
	 * @param options.host - Filter expectations by host name (partial match)
	 * @param options.dedupe - Remove duplicate expectations based  on request
	 * @param options.raw - Save full original requests (true) or cleaned requests (false, default)
	 *   - raw: false (default) - Saves only essential fields: method, path, queryStringParameters (GET), body (POST/PUT)
	 *   - raw: true - Saves complete original request including all headers and metadata
	 * @param options.transform - Transform function to modify expectation before saving
	 */
	async recordExpectations(
		folderName: string,
		options?: {
			pathOrRequestDefinition?: PathOrRequestDefinition;
			host?: string;
			dedupe?: boolean;
			raw?: boolean;
			transform?: (expectation: Expectation) => Expectation;
		},
	): Promise<void> {
		try {
			// Retrieve recorded expectations from the mock server
			const recordedExpectations = await this.client.retrieveRecordedExpectations(
				options?.pathOrRequestDefinition,
			);

			// Create target directory path
			const targetDir = join(this.expectationsDir, folderName);

			// Ensure target directory exists
			await fs.mkdir(targetDir, { recursive: true });
			const seenRequests = new Set<string>();

			for (const expectation of recordedExpectations) {
				if (
					!expectation.httpRequest ||
					!(
						'method' in expectation.httpRequest &&
						typeof expectation.httpRequest.method === 'string' &&
						typeof expectation.httpRequest.path === 'string'
					)
				) {
					continue;
				}

				// Extract host for filename and filtering
				const headers = expectation.httpRequest.headers ?? {};
				const hostHeader = 'Host' in headers ? headers?.Host : undefined;
				const hostName = Array.isArray(hostHeader) ? hostHeader[0] : (hostHeader ?? 'unknown-host');

				if (options?.host && typeof hostName === 'string' && !hostName.includes(options.host)) {
					continue;
				}

				const method = expectation.httpRequest.method;
				let requestForProcessing: Record<string, unknown> | HttpRequest;

				if (options?.raw) {
					// Use raw request without cleaning
					requestForProcessing = expectation.httpRequest;
				} else {
					// Clean up the request data
					const cleanedRequest: Record<string, unknown> = {
						method: expectation.httpRequest.method,
						path: expectation.httpRequest.path,
					};

					// Include different fields based on method
					if (method === 'GET') {
						// For GET requests, include queryStringParameters if present
						if (expectation.httpRequest.queryStringParameters) {
							cleanedRequest.queryStringParameters = expectation.httpRequest.queryStringParameters;
						}
					} else if (method === 'POST' || method === 'PUT') {
						// For POST/PUT requests, include body if present
						if (expectation.httpRequest.body) {
							cleanedRequest.body = expectation.httpRequest.body;
						}
					}

					requestForProcessing = cleanedRequest;
				}

				// Dedupe expectations if requested
				if (options?.dedupe) {
					const dedupeKey = JSON.stringify(requestForProcessing);

					if (seenRequests.has(dedupeKey)) {
						continue;
					}

					seenRequests.add(dedupeKey);
				}

				// Create expectation (cleaned or raw)
				let processedExpectation: Expectation = {
					...expectation,
					httpRequest: requestForProcessing,
					times: {
						unlimited: true,
					},
				};

				// Apply transform if provided
				if (options?.transform) {
					processedExpectation = options.transform(processedExpectation);
				}

				// Generate unique filename based on request details
				const hash = crypto
					.createHash('sha256')
					.update(JSON.stringify(requestForProcessing))
					.digest('hex')
					.substring(0, 8);

				const filename = `${Date.now()}-${hostName}-${method}-${expectation.httpRequest.path.replace(/[^a-zA-Z0-9]/g, '_')}-${hash}.json`;
				processedExpectation.id = filename;
				const filePath = join(targetDir, filename);

				// Write expectation to JSON file
				await fs.writeFile(filePath, JSON.stringify(processedExpectation, null, 2));
			}
		} catch (error) {
			throw new Error(`Failed to record expectations: ${JSON.stringify(error)}`);
		}
	}

	async getActiveExpectations() {
		return await this.client.retrieveActiveExpectations({ method: 'GET' });
	}
}
