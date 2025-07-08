"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const openai_1 = __importDefault(require("openai"));
async function run() {
    try {
        // 입력값
        const openaiKey = core.getInput('openai-key', { required: true });
        const model = core.getInput('model') || 'gpt-3.5-turbo';
        const token = core.getInput('repo-token', { required: true });
        // OpenAI 클라이언트
        const openai = new openai_1.default({
            apiKey: openaiKey,
        });
        // GitHub 컨텍스트
        const ctx = github.context;
        if (ctx.eventName !== 'push') {
            core.info(`이 액션은 push 이벤트에서만 동작합니다. 현재 이벤트: ${ctx.eventName}`);
            return;
        }
        // 푸시된 커밋 사이의 diff 가져오기
        const octokit = github.getOctokit(token);
        const repo = ctx.repo;
        const before = ctx.payload.before;
        const after = ctx.payload.after;
        const response = await octokit.rest.repos.compareCommits({
            owner: repo.owner,
            repo: repo.repo,
            base: before,
            head: after
        });
        if (!response?.data || !response.data?.files)
            return;
        const patches = response.data.files
            .filter(f => f.patch)
            .map(f => `===== ${f.filename} =====\n${f.patch}`)
            .join('\n\n');
        if (!patches) {
            core.info('변경된 파일이 없습니다.');
            return;
        }
        // OpenAI ChatCompletion 호출
        const messages = [
            { role: 'system', content: 'You are an expert code reviewer.' },
            { role: 'user', content: patches }
        ];
        const completion = await openai.chat.completions.create({
            model,
            messages,
        });
        const review = completion.choices[0].message.content;
        core.setOutput('ai_response', review);
        // (옵션) Slack 알림 등 후속 처리
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
