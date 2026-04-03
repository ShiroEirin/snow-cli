import test from 'ava';

import {buildVcpToolPlaneIndicator} from './vcpToolPlane.js';

const copy = {
	label: '工具传输方式:',
	local: 'Local tools（Snow 本地/MCP）',
	bridge: 'SnowBridge（VCP 工具桥接）',
	hybrid: 'Hybrid（本地工具 + SnowBridge）',
};

test('native mode does not expose a VCP tool plane indicator', t => {
	t.is(
		buildVcpToolPlaneIndicator(
			{
				backendMode: 'native',
				toolTransport: 'local',
			},
			copy,
		),
		undefined,
	);
});

test('vcp local transport uses the local tools label', t => {
	t.deepEqual(
		buildVcpToolPlaneIndicator(
			{
				backendMode: 'vcp',
				toolTransport: 'local',
			},
			copy,
		),
		{
			simpleText: '🧰 Local tools（Snow 本地/MCP）',
			detailedText: '🧰 工具传输方式: Local tools（Snow 本地/MCP）',
		},
	);
});

test('vcp bridge transport uses the SnowBridge label', t => {
	t.deepEqual(
		buildVcpToolPlaneIndicator(
			{
				backendMode: 'vcp',
				toolTransport: 'bridge',
			},
			copy,
		),
		{
			simpleText: '🧰 SnowBridge（VCP 工具桥接）',
			detailedText: '🧰 工具传输方式: SnowBridge（VCP 工具桥接）',
		},
	);
});

test('vcp hybrid transport uses the hybrid label', t => {
	t.deepEqual(
		buildVcpToolPlaneIndicator(
			{
				backendMode: 'vcp',
				toolTransport: 'hybrid',
			},
			copy,
		),
		{
			simpleText: '🧰 Hybrid（本地工具 + SnowBridge）',
			detailedText: '🧰 工具传输方式: Hybrid（本地工具 + SnowBridge）',
		},
	);
});
