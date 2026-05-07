import type {TodoService} from '../../../mcp/todo.js';
import {executeNotebookTool} from '../../../mcp/notebook.js';
import {subAgentService} from '../../../mcp/subagent.js';
import {teamService} from '../../../mcp/team.js';
import {executeSkillTool} from '../../../mcp/skills.js';

type LocalExecutorParams = {
	serviceName: string;
	actualToolName: string;
	toolName: string;
	args: any;
	getTodoService: () => TodoService;
	abortSignal?: AbortSignal;
	onTokenUpdate?: (tokenCount: number) => void;
};

const LOCAL_TOOL_SERVICES = new Set([
	'todo',
	'notebook',
	'filesystem',
	'terminal',
	'ace',
	'websearch',
	'ide',
	'codebase',
	'askuser',
	'scheduler',
	'skill',
	'subagent',
	'team',
]);

export function isLocalToolService(serviceName: string): boolean {
	return LOCAL_TOOL_SERVICES.has(serviceName);
}

export async function executeLocalToolCall(
	params: LocalExecutorParams,
): Promise<any> {
	const {
		serviceName,
		actualToolName,
		toolName,
		args,
		getTodoService,
		abortSignal,
		onTokenUpdate,
	} = params;

	if (serviceName === 'todo') {
		return getTodoService().executeTool(actualToolName, args);
	}

	if (serviceName === 'notebook') {
		return executeNotebookTool(toolName, args);
	}

	if (serviceName === 'filesystem') {
		const {filesystemService} = await import('../../../mcp/filesystem.js');

		switch (actualToolName) {
			case 'read':
				if (!args.filePath) {
					throw new Error(
						`Missing required parameter 'filePath' for filesystem-read tool.\n` +
							`Received args: ${JSON.stringify(args, null, 2)}\n` +
							`AI Tip: Make sure to provide the 'filePath' parameter as a string.`,
					);
				}

				return filesystemService.getFileContent(
					args.filePath,
					args.startLine,
					args.endLine,
				);
			case 'create':
				if (!args.filePath) {
					throw new Error(
						`Missing required parameter 'filePath' for filesystem-create tool.\n` +
							`Received args: ${JSON.stringify(args, null, 2)}\n` +
							`AI Tip: Make sure to provide the 'filePath' parameter as a string.`,
					);
				}

				if (args.content === undefined || args.content === null) {
					throw new Error(
						`Missing required parameter 'content' for filesystem-create tool.\n` +
							`Received args: ${JSON.stringify(args, null, 2)}\n` +
							`AI Tip: Make sure to provide the 'content' parameter as a string (can be empty string \"\").`,
					);
				}

				return filesystemService.createFile(
					args.filePath,
					args.content,
					args.createDirectories,
				);
			case 'edit':
				if (!args.filePath) {
					throw new Error(
						`Missing required parameter 'filePath' for filesystem-edit tool.\n` +
							`Received args: ${JSON.stringify(args, null, 2)}\n` +
							`AI Tip: Make sure to provide the 'filePath' parameter as a string or array.`,
					);
				}

				if (
					!Array.isArray(args.filePath) &&
					(args.startLine === undefined ||
						args.endLine === undefined ||
						args.newContent === undefined)
				) {
					throw new Error(
						`Missing required parameters for filesystem-edit tool.\n` +
							`For single file mode, 'startLine', 'endLine', and 'newContent' are required.\n` +
							`Received args: ${JSON.stringify(args, null, 2)}\n` +
							`AI Tip: Provide startLine (number), endLine (number), and newContent (string).`,
					);
				}

				return filesystemService.editFile(
					args.filePath,
					args.startLine,
					args.endLine,
					args.newContent,
					args.contextLines,
				);
			case 'edit_search':
				if (!args.filePath) {
					throw new Error(
						`Missing required parameter 'filePath' for filesystem-edit_search tool.\n` +
							`Received args: ${JSON.stringify(args, null, 2)}\n` +
							`AI Tip: Make sure to provide the 'filePath' parameter as a string or array.`,
					);
				}

				if (
					!Array.isArray(args.filePath) &&
					(args.searchContent === undefined ||
						args.replaceContent === undefined)
				) {
					throw new Error(
						`Missing required parameters for filesystem-edit_search tool.\n` +
							`For single file mode, 'searchContent' and 'replaceContent' are required.\n` +
							`Received args: ${JSON.stringify(args, null, 2)}\n` +
							`AI Tip: Provide searchContent (string) and replaceContent (string).`,
					);
				}

				return filesystemService.editFileBySearch(
					args.filePath,
					args.searchContent,
					args.replaceContent,
					args.occurrence,
					args.contextLines,
				);
			default:
				throw new Error(`Unknown filesystem tool: ${actualToolName}`);
		}
	}

	if (serviceName === 'terminal') {
		const {terminalService} = await import('../../../mcp/bash.js');
		const {setTerminalExecutionState} = await import(
			'../../../hooks/execution/useTerminalExecutionState.js'
		);

		switch (actualToolName) {
			case 'execute':
				if (!args.workingDirectory) {
					throw new Error(
						`Missing required parameter 'workingDirectory' for terminal-execute tool.\n` +
							`Received args: ${JSON.stringify(args, null, 2)}\n` +
							`AI Tip: You MUST specify the workingDirectory where the command should run. Use the project root path or a specific directory path.`,
					);
				}

				terminalService.setWorkingDirectory(args.workingDirectory);
				setTerminalExecutionState({
					isExecuting: true,
					command: args.command,
					timeout: args.timeout || 30000,
					isBackgrounded: false,
					output: [],
					needsInput: false,
					inputPrompt: null,
				});

				try {
					return await terminalService.executeCommand(
						args.command,
						args.timeout,
						abortSignal,
						args.isInteractive ?? false,
					);
				} finally {
					setTerminalExecutionState({
						isExecuting: false,
						command: null,
						timeout: null,
						isBackgrounded: false,
						output: [],
						needsInput: false,
						inputPrompt: null,
					});
				}
			default:
				throw new Error(`Unknown terminal tool: ${actualToolName}`);
		}
	}

	if (serviceName === 'ace') {
		const {hybridCodeSearchService} = await import(
			'../../../mcp/lsp/HybridCodeSearchService.js'
		);

		switch (actualToolName) {
			case 'search_symbols':
				return hybridCodeSearchService.semanticSearch(
					args.query,
					'all',
					args.language,
					args.symbolType,
					args.maxResults,
				);
			case 'find_definition':
				return hybridCodeSearchService.findDefinition(
					args.symbolName,
					args.contextFile,
					args.line,
					args.column,
				);
			case 'find_references':
				return hybridCodeSearchService.findReferences(
					args.symbolName,
					args.maxResults,
				);
			case 'semantic_search':
				return hybridCodeSearchService.semanticSearch(
					args.query,
					args.searchType,
					args.language,
					args.symbolType,
					args.maxResults,
				);
			case 'file_outline':
				return hybridCodeSearchService.getFileOutline(args.filePath, {
					maxResults: args.maxResults,
					includeContext: args.includeContext,
					symbolTypes: args.symbolTypes,
				});
			case 'text_search':
				return hybridCodeSearchService.textSearch(
					args.pattern,
					args.fileGlob,
					args.isRegex,
					args.maxResults,
				);
			default:
				throw new Error(`Unknown ACE tool: ${actualToolName}`);
		}
	}

	if (serviceName === 'websearch') {
		const {webSearchService} = await import('../../../mcp/websearch.js');

		switch (actualToolName) {
			case 'search':
				return webSearchService.search(args.query, args.maxResults);
			case 'fetch':
				return webSearchService.fetchPage(
					args.url,
					args.maxLength,
					args.isUserProvided,
					args.userQuery,
					abortSignal,
					onTokenUpdate,
				);
			default:
				throw new Error(`Unknown websearch tool: ${actualToolName}`);
		}
	}

	if (serviceName === 'ide') {
		const {ideDiagnosticsService} = await import(
			'../../../mcp/ideDiagnostics.js'
		);

		switch (actualToolName) {
			case 'get_diagnostics': {
				const diagnostics = await ideDiagnosticsService.getDiagnostics(
					args.filePath,
				);
				const formatted = ideDiagnosticsService.formatDiagnostics(
					diagnostics,
					args.filePath,
				);
				return {
					diagnostics,
					formatted,
					summary: `Found ${diagnostics.length} diagnostic(s) in ${args.filePath}`,
				};
			}
			default:
				throw new Error(`Unknown IDE tool: ${actualToolName}`);
		}
	}

	if (serviceName === 'codebase') {
		const {codebaseSearchService} = await import(
			'../../../mcp/codebaseSearch.js'
		);

		switch (actualToolName) {
			case 'search':
				return codebaseSearchService.search(args.query, args.topN, abortSignal);
			default:
				throw new Error(`Unknown codebase tool: ${actualToolName}`);
		}
	}

	if (serviceName === 'askuser') {
		switch (actualToolName) {
			case 'ask_question':
				if (!args.question || typeof args.question !== 'string') {
					return {
						content: [
							{
								type: 'text',
								text: `Error: "question" parameter must be a non-empty string.\n\nReceived: ${JSON.stringify(
									args,
									null,
									2,
								)}\n\nPlease retry with correct parameters.`,
							},
						],
						isError: true,
					};
				}

				if (!Array.isArray(args.options)) {
					return {
						content: [
							{
								type: 'text',
								text: `Error: "options" parameter must be an array of strings.\n\nReceived options: ${JSON.stringify(
									args.options,
								)}\nType: ${typeof args.options}\n\nPlease retry with correct parameters. Example:\n{\n  "question": "Your question here",\n  "options": ["Option 1", "Option 2", "Option 3"]\n}`,
							},
						],
						isError: true,
					};
				}

				if (args.options.length < 2) {
					return {
						content: [
							{
								type: 'text',
								text: `Error: "options" array must contain at least 2 options.\n\nReceived: ${JSON.stringify(
									args.options,
								)}\n\nPlease provide at least 2 options for the user to choose from.`,
							},
						],
						isError: true,
					};
				}

				const invalidOptions = args.options.filter(
					(option: any) => typeof option !== 'string',
				);
				if (invalidOptions.length > 0) {
					return {
						content: [
							{
								type: 'text',
								text: `Error: All options must be strings.\n\nInvalid options: ${JSON.stringify(
									invalidOptions,
								)}\n\nPlease ensure all options are strings.`,
							},
						],
						isError: true,
					};
				}

				const {UserInteractionNeededError} = await import(
					'../../../utils/ui/userInteractionError.js'
				);
				throw new UserInteractionNeededError(
					args.question,
					args.options,
					'',
					false,
				);
			default:
				throw new Error(`Unknown askuser tool: ${actualToolName}`);
		}
	}

	if (serviceName === 'scheduler') {
		switch (actualToolName) {
			case 'schedule_task': {
				if (
					typeof args.duration !== 'number' ||
					args.duration < 1 ||
					args.duration > 3600
				) {
					return {
						content: [
							{
								type: 'text',
								text: `Error: "duration" must be a number between 1 and 3600 seconds.\n\nReceived: ${JSON.stringify(
									args.duration,
								)}`,
							},
						],
						isError: true,
					};
				}

				if (!args.description || typeof args.description !== 'string') {
					return {
						content: [
							{
								type: 'text',
								text: `Error: "description" must be a non-empty string.\n\nReceived: ${JSON.stringify(
									args.description,
								)}`,
							},
						],
						isError: true,
					};
				}

				const duration = args.duration;
				const description = args.description;
				const startedAt = new Date().toISOString();
				const {
					startSchedulerTask,
					updateSchedulerRemainingTime,
					completeSchedulerTask,
					resetSchedulerState,
				} = await import(
					'../../../hooks/execution/useSchedulerExecutionState.js'
				);

				startSchedulerTask(description, duration);

				let wasAborted = false;
				await new Promise<void>(resolve => {
					const startTime = Date.now();
					const targetTime = startTime + duration * 1000;

					const updateInterval = setInterval(() => {
						const remaining = Math.ceil((targetTime - Date.now()) / 1000);
						if (remaining > 0) {
							updateSchedulerRemainingTime(remaining);
						}
					}, 1000);

					const timeout = setTimeout(() => {
						clearInterval(updateInterval);
						completeSchedulerTask();
						resolve();
					}, duration * 1000);

					if (abortSignal) {
						const abortHandler = () => {
							wasAborted = true;
							clearInterval(updateInterval);
							clearTimeout(timeout);
							resetSchedulerState();
							resolve();
						};
						abortSignal.addEventListener('abort', abortHandler, {once: true});
					}
				});

				if (wasAborted) {
					return {
						content: [
							{
								type: 'text',
								text: 'Scheduled task was interrupted by user',
							},
						],
						isError: true,
					};
				}

				return {
					success: true,
					description,
					actualDuration: duration,
					startedAt,
					completedAt: new Date().toISOString(),
					message: `Scheduled task completed: ${description}`,
				};
			}
			default:
				throw new Error(`Unknown scheduler tool: ${actualToolName}`);
		}
	}

	if (serviceName === 'skill') {
		const projectRoot = process.cwd();
		return executeSkillTool(toolName, args, projectRoot);
	}

	if (serviceName === 'subagent') {
		return subAgentService.execute({
			agentId: actualToolName,
			prompt: args.prompt,
			abortSignal,
		});
	}

	if (serviceName === 'team') {
		return teamService.execute({
			toolName: actualToolName,
			args,
			abortSignal,
		});
	}

	throw new Error(`Unsupported local tool service: ${serviceName}`);
}
