# LLM Deployment and Evaluation

UrbanMend ships two built-in HTTPS providers, selected by name in `CLASSIFICATION_LLM_PROVIDER`:

| Value | Provider | API shape |
|---|---|---|
| `google_ai_studio` | Google AI Studio (Gemini) | native `:generateContent` |
| `openai_compatible` | any OpenAI-compatible service | `/chat/completions` |

Anything else is treated as a dotted path to an `LLMProvider` subclass taking no constructor
arguments. Production deployments must name a provider explicitly; the shipped default is
`UnconfiguredLLMProvider`, so a deployment that configures nothing classifies through the
deterministic keyword fallback rather than failing (FR-13a, NFR-4).

## Configuration — Google AI Studio

Set these values in the deployment secret/configuration store, not in committed files:

```dotenv
CLASSIFICATION_LLM_PROVIDER=google_ai_studio
CLASSIFICATION_LLM_ENDPOINT=https://generativelanguage.googleapis.com/v1beta
CLASSIFICATION_LLM_API_KEY=<secret>
CLASSIFICATION_LLM_MODEL=gemini-2.5-flash
CLASSIFICATION_LLM_THINKING_BUDGET=0
CLASSIFICATION_LLM_TIMEOUT_SECONDS=10
CLASSIFICATION_LLM_MAX_ATTEMPTS=2
CLASSIFICATION_LLM_MAX_OUTPUT_TOKENS=300
CLASSIFICATION_LLM_DAILY_TOKEN_BUDGET=1000000
CLASSIFICATION_LOW_CONFIDENCE_THRESHOLD=0.70
```

⚠️ **`CLASSIFICATION_LLM_THINKING_BUDGET=0` is load-bearing on Gemini 2.5, not a tuning knob.**
Reasoning tokens are billed as output and are drawn from the same `maxOutputTokens` allowance, which
NFR-13 sizes for a four-field JSON answer (300). Leave thinking enabled at that ceiling and the model
spends the whole budget thinking, then returns a candidate with no text and
`finishReason: MAX_TOKENS` — on *every* report, so triage degrades to the keyword fallback
permanently while the dashboard shows a healthy provider and the invoice shows real spend. Set the
variable **empty** (not `0`) for a pre-2.5 model, which rejects the `thinkingConfig` field outright.

Both providers send only report text, language, and the active category slugs; neither sends user
identity, coordinates, address, or contact fields. The key travels in a header
(`x-goog-api-key` / `Authorization`), never in the query string, so it cannot be captured by
intermediary access logs (NFR-12).

⚠️ **P7 and the free tier are in direct conflict, and no code path can tell them apart.** Google's
unpaid AI Studio tier may use submitted prompts to improve its products; what UrbanMend submits is
citizen report text. A free key is therefore fine for local development against synthetic reports and
**not** acceptable for a deployment handling real submissions — enable billing on the key first, since
the paid tier is what carries the no-training commitment. The application cannot detect which tier a
key belongs to, so this is a deployment decision that has to be recorded against ❓Q9 rather than
enforced by a guard. Also set a provider-side spend limit, keep the key project-scoped, and rotate it
after any accidental exposure.

Before enabling traffic, run a provider smoke evaluation inside the API container:

```powershell
docker compose exec -T api python manage.py evaluate_classifier `
  docs/evaluation/classification-sample.jsonl --classifier llm
```

⚠️ **A wrong key does not announce itself through the API.** Google answers `401`, the adapter raises
`ClassificationUnavailable`, T3.4 degrades to keywords, and `POST /reports` still returns `202` — so
the only difference between "the LLM is working" and "the LLM has never once been reached" is in the
worker log. `docker compose logs worker` and grep for `classification.llm.attempt_failed` (transport or
auth failure) and `classification.fallback_selected` (any degrade). The smoke evaluation above is worth
running precisely because it is the one place the failure is loud.

## Evaluation Dataset

The committed sample is a smoke set, not evidence for the 85% acceptance claim. Build a held-out,
human-reviewed JSONL dataset with at least 100 examples, balanced across the seven categories, four
severity bands, and English/Bangla/code-mixed reports. Do not copy production PII into it.

Each line has this schema:

```json
{"text":"...","language":"bn","expected_category":"roads","expected_severity":"high"}
```

Freeze the dataset before prompt/model tuning. Keep a separate development set for tuning so the
held-out score remains meaningful. Have two reviewers label severity independently and adjudicate
disagreements, since severity agreement cannot exceed label quality.

Run the release gate with the PRD's category target and the initial severity target:

```powershell
docker compose exec -T api python manage.py evaluate_classifier `
  path/to/held-out.jsonl --classifier llm --category-target 0.85 `
  --severity-target 0.80 --fail-below-target
```

Archive the JSON output with the model name, prompt/code revision, date, and dataset revision. A
model or prompt change requires rerunning the same held-out set. Investigate results per category
and severity even when the aggregate gate passes; a balanced aggregate can hide a life-safety
regression in the Critical band.
