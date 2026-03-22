/* eslint-disable unicorn/prefer-module */

/**
 * 清理构建产物目录，避免 tsc 残留旧输出导致 bundle 与 source 不一致。
 *
 * 说明：
 * - tsc 默认不会删除已不存在源文件对应的 dist 输出文件
 * - build.mjs 依赖 dist/ 作为入口进行打包
 * - 可通过命令行参数指定清理目标；未指定时默认清理 dist/ 与 bundle/
 */

const fs = require('fs');

const directories =
	process.argv.length > 2 ? process.argv.slice(2) : ['dist', 'bundle'];

for (const dir of directories) {
	try {
		fs.rmSync(dir, {recursive: true, force: true});
	} catch {
		// 清理失败不应阻断构建流程
	}
}
