import * as core from '@actions/core';
import * as github from '@actions/github';
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";
import axios from "axios";
import * as fs from "fs";

async function run() {
    try {
        // 입력값
        const openaiKey = core.getInput('openai-key', { required: true });
        const model     = core.getInput('model') || 'gpt-3.5-turbo';
        const token     = core.getInput('repo-token', { required: true });
        const slackWebhookUrl = core.getInput('slack-webhook-url', { required: true });

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

        // 변동된 파일 전체 내용 읽기
        const fullFiles: string[] = response.data.files
            .filter(f => f.filename && fs.existsSync(f.filename))
            .map(f => {
                const content = fs.readFileSync(f.filename, "utf8");
                return `===== ${f.filename} =====\n${content}`;
            });
        const fullReviewInput = fullFiles.join("\n\n");

        // 리포지토리 이름과 수정된 파일 목록 준비
        const repoFullName = `${repo.owner}/${repo.repo}`;
        const modifiedFiles = response.data.files.map(f => f.filename).filter(Boolean).join(', ');
        const userContent =
            `레포지토리: ${repoFullName}\n` +
            `수정된 파일: ${modifiedFiles}\n\n` +
            `=== DIFF ===\n${patches}\n\n` +
            `=== 전체 파일 내용 ===\n${fullReviewInput}`;

        if (!patches) {
            core.info('변경된 파일이 없습니다.');
            return;
        }

        // OpenAI ChatCompletion 호출
        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: '당신은 전문 코드 리뷰어입니다. 다음 변경사항 중에서 반드시 수정해야 하는 치명적 이슈(예: WHERE 절 누락, 반복문 내 중복 쿼리, 보안 취약점, 논리적 오류 등)만 한글로 보고하세요. 스타일, 권장 관례, 가벼운 제안이나 요약은 언급하지 마십시오. 답변할때는 수정된 레포지토리의 이름과 파일명을 모두 언급해주세요. 수정된 라인 번호도 정확히 언급해야합니다.'
            },
            { role: 'user', content: userContent },
        ];

        const completion = await openai.chat.completions.create({
            model,
            messages,
        });

        const review = completion.choices[0].message!.content;
        core.setOutput('ai_response', review);

        if (slackWebhookUrl) {
            try {
                const response = await axios.post(slackWebhookUrl, {
                    text: `AI Code Review:\n\n${review}`,
                });

                if (response.status !== 200) {
                    throw new Error(`Slack 메시지 전송 실패: ${response.statusText}`);
                }
                core.info('Slack 메시지 전송 성공');
            } catch (error: any) {
                core.warning(`Slack 메시지 전송 실패: ${error.message}`);
            }
        }
    } catch (error: any) {
        core.setFailed(error.message);
    }
}

run();