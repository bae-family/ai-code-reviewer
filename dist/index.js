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
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
async function run() {
    try {
        // 입력값
        const openaiKey = core.getInput('openai-key', { required: true });
        const model = core.getInput('model') || 'gpt-3.5-turbo';
        const token = core.getInput('repo-token', { required: true });
        const slackWebhookUrl = core.getInput('slack-webhook-url', { required: true });
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
        // 변동된 파일 전체 내용 읽기
        const fullFiles = response.data.files
            .filter(f => f.filename && fs.existsSync(f.filename))
            .map(f => {
            const content = fs.readFileSync(f.filename, "utf8");
            return `===== ${f.filename} =====\n${content}`;
        });
        const fullReviewInput = fullFiles.join("\n\n");
        if (!patches) {
            core.info('변경된 파일이 없습니다.');
            return;
        }
        // OpenAI ChatCompletion 호출
        const messages = [
            {
                role: 'system',
                content: '당신은 전문 코드 리뷰어입니다. 다음 변경사항 중에서 반드시 수정해야 하는 치명적 이슈(예: WHERE 절 누락, 반복문 내 중복 쿼리, 보안 취약점, 논리적 오류 등)만 한글로 보고하세요. 스타일, 권장 관례, 가벼운 제안이나 요약은 언급하지 마십시오.'
            },
            { role: 'user', content: fullReviewInput },
        ];
        const completion = await openai.chat.completions.create({
            model,
            messages,
        });
        const review = completion.choices[0].message.content;
        core.setOutput('ai_response', review);
        if (slackWebhookUrl) {
            try {
                const response = await axios_1.default.post(slackWebhookUrl, {
                    text: `AI Code Review:\n\n${review}`,
                });
                if (response.status !== 200) {
                    throw new Error(`Slack 메시지 전송 실패: ${response.statusText}`);
                }
                core.info('Slack 메시지 전송 성공');
            }
            catch (error) {
                core.warning(`Slack 메시지 전송 실패: ${error.message}`);
            }
        }
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
