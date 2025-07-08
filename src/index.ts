import * as core from '@actions/core';
import * as github from '@actions/github';
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";

async function run() {
    try {
        // 입력값
        const openaiKey = core.getInput('openai-key', { required: true });
        const model     = core.getInput('model') || 'gpt-3.5-turbo';
        const token     = core.getInput('repo-token', { required: true });

        // OpenAI 클라이언트
        const openai = new OpenAI({
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
        const repo    = ctx.repo;
        const before  = ctx.payload.before!;
        const after   = ctx.payload.after!;
        const response = await octokit.rest.repos.compareCommits({
            owner: repo.owner,
            repo:  repo.repo,
            base:  before,
            head:  after
        });

        if (!response?.data || !response.data?.files) return;
        const patches = response.data.files
            .filter(f => f.patch)
            .map(f => `===== ${f.filename} =====\n${f.patch}`)
            .join('\n\n');

        if (!patches) {
            core.info('변경된 파일이 없습니다.');
            return;
        }

        // OpenAI ChatCompletion 호출
        const messages: ChatCompletionMessageParam[] = [
            { role: 'system', content: 'You are an expert code reviewer.' },
            { role: 'user', content: patches }
        ];

        const completion = await openai.chat.completions.create({
            model,
            messages,
        });

        const review = completion.choices[0].message!.content;
        core.setOutput('ai_response', review);

        // (옵션) Slack 알림 등 후속 처리
    } catch (error: any) {
        core.setFailed(error.message);
    }
}

run();