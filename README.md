

# GPT Code Review Action (TypeScript)

A GitHub Action that uses OpenAI's ChatCompletion API to review code changes on **push** events and posts the review output to Slack via webhook. Built with TypeScript and `@actions/*` libraries.

## Features

- Runs on **push** events (all branches by default)
- Fetches the diff between commits and sends it to OpenAI
- Outputs AI-generated code review as an action output (`ai_response`)
- Optionally posts the review to a Slack channel via webhook
- Zero dependencies in the action runtime—bundled with `@vercel/ncc`

## Usage

Add a workflow file (e.g., `.github/workflows/ci.yml`) to your repository:

```yaml
name: AI Code Review on Push

on:
  push:
    paths-ignore:
      - 'docs/**'

jobs:
  review:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Run GPT Code Review
        uses: ./action
        with:
          openai-key: ${{ secrets.OPENAI_API_KEY }}
          repo-token:  ${{ secrets.GITHUB_TOKEN }}
          model:       gpt-3.5-turbo
          slack-webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Inputs

| Input             | Description                                   | Required | Default        |
|-------------------|-----------------------------------------------| -------- |----------------|
| `openai-key`      | Your OpenAI API key                           | yes      |                |
| `repo-token`      | GitHub token (usually `secrets.GITHUB_TOKEN`) | yes      |                |
| `model`           | OpenAI model to use                           | no       | `gpt-3.5-turbo` |
| `slack-webhook-url`| Slack webhook URL for message                 | no       |                |

## Outputs

| Output         | Description                        |
| -------------- | ---------------------------------- |
| `ai_response`  | AI-generated review text           |

## Developing Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Compile TypeScript:
   ```bash
   npm run build:ts
   ```
3. Bundle action:
   ```bash
   npm run bundle
   ```
4. Test with [act](https://github.com/nektos/act):
   ```bash
   act push -P ubuntu-latest=nektos/act-environments-ubuntu:18.04 \
     --secret OPENAI_API_KEY=$OPENAI_API_KEY \
     --secret GITHUB_TOKEN=$GITHUB_TOKEN
   ```

## Contributing

Contributions welcome! Please open issues or pull requests on GitHub.

## License

Apache © soobin.park