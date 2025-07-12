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
        // 리포지토리 이름과 수정된 파일 목록 준비
        const repoFullName = `${repo.owner}/${repo.repo}`;
        const modifiedFiles = response.data.files.map(f => f.filename).filter(Boolean).join(', ');
        const userContent = `레포지토리: ${repoFullName}\n` +
            `수정된 파일: ${modifiedFiles}\n\n` +
            `=== DIFF ===\n${patches}\n\n` +
            `=== 전체 파일 내용 ===\n${fullReviewInput}`;
        if (!patches) {
            core.info('변경된 파일이 없습니다.');
            return;
        }
        // OpenAI ChatCompletion 호출
        const messages = [
            {
                role: 'system',
                content: '당신은 전문 코드 리뷰어입니다.' +
                    '프로젝트 기술 스펙입니다.' +
                    '-대부분의 코드는 `PHP`, `JavaScript`, `CSS` 파일로 구성되어 있습니다.\n' +
                    '-프레임워크는 `아이모듈 (iModule)`을 사용하고 있습니다.\n' +
                    '-iModule은 고유한 구조와 메서드를 가지므로 일반 PHP 프레임워크(Laravel 등)와는 다릅니다.\n' +
                    '-JavaScript는 다음 중 하나를 사용합니다:\n' +
                    '-`ExtJS 6`\n' +
                    '-`jQuery`\n' +
                    '-또는 `Vanilla JS` (순수 자바스크립트)\n' +
                    '\n' +
                    '리뷰 시 고려 사항입니다.' +
                    '- PHP 문법 및 아이모듈 구조를 기반으로 코드를 판단해주세요.\n' +
                    '- JavaScript 코드에서 ExtJS나 jQuery API 사용은 정상적인 것입니다.\n' +
                    '- `script`, `style` 코드가 PHP 템플릿 내에 섞여 있을 수 있으니 문법 경고를 신중히 판단해주세요.\n' +
                    '- 일부 로직은 프레임워크 내부 동작을 반영한 것이므로 표준 코드 관점에서 이상해 보일 수 있으나, 그 맥락을 고려해주세요.\n' +
                    '- PHP 버전은 최소 7.1부터 지원되어야하며 8버전은 지원하지 않는 경우가 대부분입니다.' +
                    '- 스타일에 대한 수정이나 html 등 퍼블리싱과 관련된 제안사항의 중요도는 낮습니다.' +
                    '다음 변경사항 중에서 적용된 내용이 무엇인지에 대해서 간략하게 설명하고 반드시 수정해야 하는 치명적 이슈(예: WHERE 절 누락, 반복문 내 중복 쿼리, 보안 취약점, 논리적 오류 등)만 한글로 보고하세요. ' +
                    '스타일, 권장 관례, 가벼운 제안은 언급하지 마십시오. 치명적인 문제를 언급할때에는 수정된 파일의 이름을 정확하게 입력하여 주십시오. ' +
                    '정확하지 않은 라인번호는 언급할 필요없습니다. 제안하고 싶은 전체 소스를 제공할 필요는 없습니다. ' +
                    '간략하게 설명해주면 됩니다. 당신의 응답은 기획자와 해당 작업을 담당한 개발자, 동료 개발자들이 모두 보게되는 점을 염두에 두세요.' +
                    '이 응답은 슬랙을 통해서 받아볼 예정이므로 변경사항은 마크다운을 포함하고 아래의 양식을 반드시 지켜주세요.' +
                    '예시는 다음과 같습니다.' +
                    '*Code Review By OpenAI*\n' +
                    '\n' +
                    '*다음 커밋은 아래와 같은 변경사항을 포함합니다.*\n' +
                    '\n' +
                    '- 이 코드는 유용한 정보를 추가하는 것으로 보이는 일부 비즈니스 로직을 기반으로 상태를 `$lists[$i]` 풍부 하게 하려고 시도합니다. `page`  \n' +
                    '- 삼항 연산자를 사용하면 코드가 간결해집니다.\n' +
                    '\n' +
                    '\n' +
                    '*문제점 및 제안*  \n' +
                    '*1. 루프 내부의 비효율적인 데이터베이스 쿼리*\n' +
                    '\n' +
                    '```\n' +
                    '$data = $this->db()->select($this->table->diagnosis)->where(\'idx\',$idx)->getOne();\n' +
                    '```\n' +
                    '\n' +
                    '루프 안에 있지만 (`for`에) 인증되지 않습니다. `$i`, 즉 각 반복마다 동일한 쿼리가 반복적으로 실행되므로 비효율적입니다.  \n' +
                    '- *제안*: 이 쿼리를 루프 바깥으로 옮겨 *한 번만* 실행되도록 하세요.\n' +
                    '\n' +
                    '*2. 정의되지 않은 인덱스 또는 Null 처리 가능성*  \n' +
                    '`$data` 값이 항상 반환된다는 전제하에 가정되지만, 쿼리에서 결과가 없으면 `$data`는 `null`일 수 있습니다.  \n' +
                    '이로 인해 `null`에 접근하면 *에러*가 발생할 수 있습니다.  \n' +
                    '- *제안*: 속성에 접근하기 전에 `null` 여부를 확인하는 로직을 추가하세요.\n' +
                    '\n' +
                    '\n' +
                    '*요약*  \n' +
                    '- 성능을 향상시키려면 데이터베이스 쿼리를 루프 외부로 옮깁니다.  \n' +
                    '- `$data`에 대한 `null` 검사를 추가합니다.  \n' +
                    '- `time()`에 대한 설명이 없습니다.  \n' +
                    '- 중첩된 삼항 연산자를 명확한 조건 블록으로 리팩토링합니다.  \n' +
                    '- 의도를 파악할 수 있게 주석을 추가합니다.  \n' +
                    '- 위와 같은 리팩토링을 통해 *코드 효율성*, *가독성*, *견고성*이 향상됩니다.'
            },
            { role: 'user', content: userContent },
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
                    text: `${review}`,
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
