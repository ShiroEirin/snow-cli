import anyTest from 'ava';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const test = anyTest as any;

function readConversationSetupSource(): string {
	return readFileSync(
		fileURLToPath(
			new URL(
				'../../../hooks/conversation/core/conversationSetup.ts',
				import.meta.url,
			),
		),
		'utf8',
	);
}

test('conversationSetup keeps VCP compatibility behind facade seam', (t: any) => {
	const source = readConversationSetupSource();

	t.true(
		source.includes(
			"from '../../../utils/session/vcpCompatibility/toolPlaneFacade.js'",
		),
	);
	t.true(source.includes('prepareToolPlane({'));

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
