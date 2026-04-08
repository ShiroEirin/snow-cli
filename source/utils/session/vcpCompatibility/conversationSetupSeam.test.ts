import anyTest from 'ava';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const test = anyTest as any;

function readSource(relativePath: string): string {
	return readFileSync(
		fileURLToPath(
			new URL(relativePath, import.meta.url),
		),
		'utf8',
	);
}

test('conversationSetup keeps VCP compatibility behind facade seam', (t: any) => {
	const source = readSource(
		'../../../hooks/conversation/core/conversationSetup.ts',
	);

	t.true(
		source.includes(
			"from '../../../utils/session/vcpCompatibility/toolPlaneFacade.js'",
		),
	);
	t.true(source.includes('prepareToolPlane({'));
	t.true(source.includes('toolContext: {'));

	const forbiddenModules = [
		'bridgeClient',
		'toolSnapshot',
		'toolRouteArbiter',
		'toolExecutionBinding',
	];

	for (const moduleName of forbiddenModules) {
		t.false(
			new RegExp(`from ['"][^'"]*${moduleName}\\.js['"]`).test(source),
			`conversationSetup must not import ${moduleName} directly`,
		);
	}
});

test('conversation core runtime state types stay behind conversationSetup seam', (t: any) => {
	const conversationTypesSource = readSource(
		'../../../hooks/conversation/core/conversationTypes.ts',
	);
	const streamingStateSource = readSource(
		'../../../hooks/conversation/useStreamingState.ts',
	);

	t.false(
		conversationTypesSource.includes('toolPlaneFacade.js'),
		'conversationTypes must not import toolPlaneFacade directly',
	);
	t.true(
		conversationTypesSource.includes("from './conversationSetup.js'"),
		'conversationTypes should source tool-plane runtime types from conversationSetup',
	);
	t.false(
		streamingStateSource.includes('toolPlaneFacade.js'),
		'useStreamingState must not import toolPlaneFacade directly',
	);
	t.true(
		streamingStateSource.includes("from './core/conversationSetup.js'"),
		'useStreamingState should source tool-plane runtime types from conversationSetup',
	);
});
