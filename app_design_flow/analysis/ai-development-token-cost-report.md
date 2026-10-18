# Workout tracker: AI development tokens and estimated cost

Report date: **18 October 2026**  
Development period covered: **8–18 October 2026**  
Currency conversion used: **US $1 = ₹95**

This guide explains what AI tokens are, how OpenAI charges for them, and what the recorded work on this app would have cost through the OpenAI API.

## 1. The result, in plain language

The four development chats in this report contain **1,307,210,474 recorded tokens**, across **8,603 recorded model responses**. At the published Standard API prices checked for this report, the estimated token cost is:

**$108.68 USD — approximately ₹10,325.**

This is an estimate of paying for the recorded tokens through an API. An API is a way for software to send requests directly to a model and pay according to usage. This estimate does **not** establish what you paid for your Codex subscription, credits, or invoices.

The large token count does not mean you typed a billion tokens. Most input was previously seen material that the model received again while working on the app. That material qualified for cheaper cached-input pricing in the recorded usage.

## 2. What is a token?

A token is a small unit of information that an AI model processes. For text, it can be a word, part of a word, punctuation, or another piece of text. Code is also broken into tokens. A token is not always one word or one character.

For example, a request such as “Add a button to save my workout” becomes a sequence of tokens. The model processes those tokens and generates more tokens to answer or write code. The exact split depends on the model's tokenizer: the system that breaks information into tokens.

Think of tokens as the units on an AI usage meter. Different kinds of units have different prices.

## 3. The three main token categories

| Category | Plain-language meaning | Example from building this app |
|---|---|---|
| **Uncached input** | Material the model processes without a usable cached copy | A new request, newly read code, or changed content |
| **Cached input** | An eligible, previously processed portion of the input whose computation can be reused | Unchanged instructions or conversation history included again |
| **Output** | Tokens the model generates | An explanation, generated code, tool-call arguments, or internal reasoning |

### Uncached input: material to process without cache reuse

Input is what the model receives before producing a response. During development, that can include your message, instructions, conversation history, code, and results returned by tools.

“Uncached” does not necessarily mean the information has never appeared before. It means a usable cache match was not available for that portion of this request. Previously seen material can therefore be charged at the uncached rate too.

### Cached input: reusing earlier processing

Prompt caching reuses computation for matching beginnings of requests. For example, a later request may repeat earlier instructions and conversation history before adding your new message. An eligible matching portion can receive the cheaper cached-input rate.

A cache hit means that reuse succeeded. Cache availability, matching content, and minimum size requirements affect eligibility; reuse is not guaranteed simply because you stayed in the same chat. Cached input still counts as input and still costs money. Caching does not replay an old answer: the model generates a new response.

Source: [OpenAI's prompt caching explanation](https://developers.openai.com/api/docs/guides/prompt-caching).

### Output: what the model generates

Output includes generated answers and code. For reasoning models, internal reasoning tokens also count toward billed output, even though you do not see them as ordinary answer text. Output can therefore be larger than the visible reply suggests.

If a usage record reports 1,000 output tokens, including 600 reasoning tokens, the output charge applies to **1,000 tokens**, not 1,600. Reasoning is already included.

Source: [OpenAI's reasoning-model documentation](https://developers.openai.com/api/docs/guides/reasoning).

### Avoid counting the same tokens twice

Cached input is part of total input. Reasoning output is part of total output. For the records used here, which report zero cache-write tokens:

```text
Uncached input = total input − cached input
Total tokens = total input + output
```

Do not add cached input on top of total input, or reasoning on top of total output. OpenAI describes these relationships in its [usage documentation](https://developers.openai.com/api/docs/guides/agents-api/observability).

## 4. A small example of how the bill works

Imagine one GPT-6.1 Sol request with:

- 10,000 total input tokens;
- 8,000 of those input tokens served from cache;
- 1,000 output tokens, including any reasoning.

That leaves **2,000 uncached input tokens**. Using Standard prices for requests up to 272,000 input tokens:

| Charge | Calculation | USD |
|---|---|---:|
| Uncached input | 2,000 ÷ 1,000,000 × $2.00 | $0.0040 |
| Cached input | 8,000 ÷ 1,000,000 × $0.10 | $0.0008 |
| Output | 1,000 ÷ 1,000,000 × $10.00 | $0.0100 |
| **Total** | Add the three charges | **$0.0148** |

At ₹95 per dollar, this example costs about **₹1.41**. These are illustrative token counts, not a particular request from your chats.

## 5. OpenAI's published prices for the six models used

The rates below are **per one million tokens**, not per message, chat, or app. “Standard” is the processing price category assumed for this estimate. Prices were checked on 18 October 2026; future prices may change.

### Standard rates: requests up to 272,000 input tokens

Each cell shows **USD / approximate INR**. INR is a conversion for comparison, not an OpenAI INR price quote.

| Model | Uncached input per 1M | Cached input per 1M | Output per 1M |
|---|---:|---:|---:|
| [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) | $0.10 / ₹9.50 | $0.01 / ₹0.95 | $0.50 / ₹47.50 |
| [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) | $2.00 / ₹190 | $0.10 / ₹9.50 | $10.00 / ₹950 |
| [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol) | $2.00 / ₹190 | $0.20 / ₹19 | $10.00 / ₹950 |
| [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) | $4.00 / ₹380 | $0.40 / ₹38 | $20.00 / ₹1,900 |
| [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) | $2.00 / ₹190 | $0.20 / ₹19 | $12.00 / ₹1,140 |
| [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) | $0.20 / ₹19 | $0.02 / ₹1.90 | $1.20 / ₹114 |

Each model name links to its official OpenAI description and pricing. GPT-5.6 Sol's published promotional pricing is stated to remain available at least through 21 November 2026. See also the [OpenAI API pricing page](https://developers.openai.com/api/docs/pricing).

### Larger requests: more than 272,000 input tokens

“Context” means the information provided to the model for a request. Larger-context prices depend on the input size of **one request**, not the lifetime total of the chat.

For these models, larger requests use twice the input and cache rates and 1.5 times the output rate. These rates apply to the full request, not just the tokens beyond the threshold.

| Model | Uncached input per 1M | Cached input per 1M | Output per 1M |
|---|---:|---:|---:|
| GPT-6 Luna | $0.20 | $0.02 | $0.75 |
| GPT-6.1 Sol | $4.00 | $0.20 | $15.00 |
| GPT-6 Sol | $4.00 | $0.40 | $15.00 |
| GPT-5.6 Sol | $8.00 | $0.80 | $30.00 |
| GPT-5.6 Terra | $4.00 | $0.40 | $18.00 |
| GPT-5.6 Luna | $0.40 | $0.04 | $1.80 |

In this snapshot, **319 GPT-6.1 Sol responses** were associated with requests above that threshold. The other recorded model groups were below it. Sources: the official model pages linked above and [OpenAI pricing](https://developers.openai.com/api/docs/pricing).

### A related category: cache writes

A cache write stores eligible processing for later reuse; a cached read reuses it. OpenAI publishes a cache-write rate of **1.25 times the uncached-input rate** for these model families. Cache-write pricing replaces the ordinary input rate for those tokens; it is not an additional input charge on the same tokens.

| Model | Cache write per 1M, up to 272K input | Approximate INR |
|---|---:|---:|
| GPT-6 Luna | $0.125 | ₹11.875 |
| GPT-6.1 Sol | $2.50 | ₹237.50 |
| GPT-6 Sol | $2.50 | ₹237.50 |
| GPT-5.6 Sol | $5.00 | ₹475 |
| GPT-5.6 Terra | $2.50 | ₹237.50 |
| GPT-5.6 Luna | $0.25 | ₹23.75 |

These rates double for requests above 272K input tokens. The development records used here report **zero cache-write tokens**, so this report adds no cache-write cost. This is a limitation of the available records, not proof of how OpenAI internally billed every request. Source: [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

## 6. Estimated cost of each development chat

These totals cover all recorded work within each chat. A chat title may describe only part of the work done there.

| Chat | Recorded tokens | Recorded responses | Estimated USD | Approximate INR |
|---|---:|---:|---:|---:|
| Build animated Expo workout tracker | 738,535,382 | 5,143 | $9.98 | ₹948 |
| Plan India subscription payments | 425,238,639 | 2,275 | $96.62 | ₹9,179 |
| Explore exercise form inspection | 123,981,854 | 1,002 | $1.80 | ₹171 |
| Add rate limiting to AI requests | 19,454,599 | 183 | $0.28 | ₹27 |
| **Total** | **1,307,210,474** | **8,603** | **$108.68** | **₹10,325** |

### Cost split by token category

| Chat | Uncached input cost | Cached input cost | Output cost | Total USD |
|---|---:|---:|---:|---:|
| Build animated Expo workout tracker | $1.65 | $7.20 | $1.13 | $9.98 |
| Plan India subscription payments | $19.71 | $65.28 | $11.63 | $96.62 |
| Explore exercise form inspection | $0.35 | $1.20 | $0.24 | $1.80 |
| Add rate limiting to AI requests | $0.06 | $0.19 | $0.04 | $0.28 |
| **Total** | **$21.78** | **$73.87** | **$13.04** | **$108.68** |

All calculations use unrounded amounts. Displayed rows and columns can differ slightly from their displayed totals because of rounding.

### Why the subscription-payments chat costs more

The other three chats used GPT-6 Luna in their recorded turn settings. The subscription-payments chat used five models, including models with higher rates, and some larger requests.

| Model and request size in that chat | Tokens | Estimated USD | Approximate INR |
|---|---:|---:|---:|
| GPT-6.1 Sol — up to 272K input | 146,907,224 | $23.17 | ₹2,201 |
| GPT-6.1 Sol — above 272K input | 100,728,066 | $27.38 | ₹2,601 |
| GPT-6 Sol | 38,868,372 | $10.16 | ₹965 |
| GPT-5.6 Sol | 45,411,295 | $26.90 | ₹2,555 |
| GPT-5.6 Terra | 23,856,900 | $7.22 | ₹686 |
| GPT-5.6 Luna | 69,466,782 | $1.80 | ₹171 |
| **Total** | **425,238,639** | **$96.62** | **₹9,179** |

This chat represents about **33% of recorded tokens** but **89% of the estimated cost**. Token counts alone cannot tell you the dollar cost: the model, caching, and request size matter too.

### Exact token counts for each model usage in each chat

Each row shows the three parts of usage separately. **Output includes reasoning tokens.** The three token columns add up to the total; cached input is not added a second time. These counts use the same fixed snapshot as the cost tables above.

| Model / usage | Uncached input tokens | Cached input tokens | Output tokens | Total tokens |
|---|---:|---:|---:|---:|
| Build animated Expo workout tracker / GPT-6 Luna | 16,512,644 | 719,764,736 | 2,258,002 | 738,535,382 |
| Plan India subscription payments / GPT-6.1 Sol — up to 272K input | 2,729,247 | 143,845,504 | 332,473 | 146,907,224 |
| Plan India subscription payments / GPT-6.1 Sol — above 272K input | 1,107,998 | 99,416,064 | 204,004 | 100,728,066 |
| Plan India subscription payments / GPT-6 Sol — up to 272K input | 742,710 | 38,018,560 | 107,102 | 38,868,372 |
| Plan India subscription payments / GPT-5.6 Sol — up to 272K input | 1,580,668 | 43,675,520 | 155,107 | 45,411,295 |
| Plan India subscription payments / GPT-5.6 Terra — up to 272K input | 860,779 | 22,919,936 | 76,185 | 23,856,900 |
| Plan India subscription payments / GPT-5.6 Luna — up to 272K input | 1,467,446 | 67,871,232 | 128,104 | 69,466,782 |
| Explore exercise form inspection / GPT-6 Luna | 3,549,603 | 119,946,624 | 485,627 | 123,981,854 |
| Add rate limiting to AI requests / GPT-6 Luna | 569,773 | 18,806,656 | 78,170 | 19,454,599 |
| **Total** | **29,120,868** | **1,274,264,832** | **3,824,774** | **1,307,210,474** |

## 7. Total estimated spending by model

This table combines the four chats. Do not add it to the chat totals; it is another view of the same spending.

| Model | Recorded tokens | Estimated USD | Approximate INR |
|---|---:|---:|---:|
| GPT-6 Luna | 881,971,835 | $12.06 | ₹1,146 |
| GPT-6.1 Sol | 247,635,290 | $50.54 | ₹4,802 |
| GPT-6 Sol | 38,868,372 | $10.16 | ₹965 |
| GPT-5.6 Sol | 45,411,295 | $26.90 | ₹2,555 |
| GPT-5.6 Terra | 23,856,900 | $7.22 | ₹686 |
| GPT-5.6 Luna | 69,466,782 | $1.80 | ₹171 |
| **Total** | **1,307,210,474** | **$108.68** | **₹10,325** |

### Exact token totals by model across all four chats

This combines repeated uses of the same model. GPT-6.1 Sol includes both request-size groups. This is another view of the counts above, so do not add the two tables together.

| Model / usage | Uncached input tokens | Cached input tokens | Output tokens | Total tokens |
|---|---:|---:|---:|---:|
| GPT-6 Luna | 20,632,020 | 858,518,016 | 2,821,799 | 881,971,835 |
| GPT-6.1 Sol | 3,837,245 | 243,261,568 | 536,477 | 247,635,290 |
| GPT-6 Sol | 742,710 | 38,018,560 | 107,102 | 38,868,372 |
| GPT-5.6 Sol | 1,580,668 | 43,675,520 | 155,107 | 45,411,295 |
| GPT-5.6 Terra | 860,779 | 22,919,936 | 76,185 | 23,856,900 |
| GPT-5.6 Luna | 1,467,446 | 67,871,232 | 128,104 | 69,466,782 |
| **Total** | **29,120,868** | **1,274,264,832** | **3,824,774** | **1,307,210,474** |

## 8. Why over a billion tokens can cost about $109

Your recorded input divides into:

| Category | Tokens |
|---|---:|
| Uncached input | 29,120,868 |
| Cached input | 1,274,264,832 |
| **Total input** | **1,303,385,700** |
| Output, including reasoning | 3,824,774 |
| **Total input plus output** | **1,307,210,474** |

About **97.8% of input tokens were cached**. The same information can count again each time it is provided to the model, even when it qualifies for a cheaper price.

For comparison, keeping the recorded models, input sizes, and outputs identical but charging all input at uncached rates gives this hypothetical result:

| Scenario | Estimated USD | Approximate INR |
|---|---:|---:|
| With recorded caching | $108.68 | ₹10,325 |
| If all recorded input were charged as uncached | $1,116.17 | ₹1,06,037 |
| **Difference** | **$1,007.49** | **₹95,712** |

That is an estimated **90.3% reduction** compared with this hypothetical uncached bill. It is not a separate refund or an amount credited to your account.

## 9. How this estimate was calculated

1. Selected the four local Codex development chats associated with this project.
2. Read their per-response `token_usage_record` entries.
3. Deduplicated entries by response ID within each chat.
4. Associated responses with the model recorded in the surrounding turn settings. These are local settings, not independently verified billing model identifiers.
5. Separated cached and uncached input and retained output as one category, including reasoning.
6. Applied larger-context pricing where a request exceeded 272,000 input tokens.
7. Applied current published Standard prices, summed the unrounded results, then converted USD to INR at ₹95 per dollar.

For the available records:

```text
Request cost in USD =
    (uncached input tokens / 1,000,000 × uncached input rate)
  + (cached input tokens / 1,000,000 × cached input rate)
  + (output tokens / 1,000,000 × output rate)

INR estimate = USD estimate × 95
```

If cache writes are reported in future records, separate those tokens from ordinary uncached input and price them at the cache-write rate.

The earlier chat response used cumulative counters and reported 1,286,992,835 tokens. This report supersedes that figure with the more complete per-response total. Some recorded requests did not increment those cumulative counters. The active development chat also continued between snapshots.

This is a fixed snapshot from the analysis on 18 October 2026. It does not update automatically as development continues.

## 10. What is excluded, and what your actual bill means

The estimate excludes:

- This token-analysis and report-writing chat.
- Internal approval-review sessions. An earlier inspection separately found approximately 24.38 million tokens in those sessions; their cost is not included here.
- Work performed through other tools, accounts, devices, or unexamined chats.
- Separately priced searches, image generation, voice, containers, and other services.
- The app's own AI requests when a person uses its coach or other features.
- Hosting, Firebase, databases, payment processing, taxes, and currency-conversion fees.

The processing tier and billing adjustments were not independently verified. Standard pricing is an assumption; Fast, Batch, Flex, regional processing, negotiated rates, and historical price changes can affect actual charges. No historical invoice reconstruction was performed.

If you developed through a subscription, your actual payment follows that plan and any purchased credits. The $108.68 estimate is not an extra amount this report says you owe. It estimates token usage at public API rates. Invoices are needed to establish actual spending.

The currency conversion uses a rounded **₹95 per US dollar**, based on [Xe's 18 October 2026 mid-market quote](https://www.xe.com/en-gb/currencyconverter/convert/?Amount=0.&From=USD&To=INR). A bank or payment provider can use a different rate.

