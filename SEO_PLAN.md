# Pawlogue SEO + AEO Plan

Owner: Daniel / Visanow AI, Inc.
Site: https://pawlogue.pet (static, GitHub Pages)
Last updated: 2026-06-01

This doc has four parts:
1. A ready-to-paste `<head>` block for index.html (meta, Open Graph, Twitter, canonical, JSON-LD).
2. Target keyword map (SEO primary + long-tail, plus AEO question phrasings).
3. On-page recommendations (headings, alt text, internal linking, content gaps).
4. OG share image spec.

Companion files already created in this folder: `robots.txt`, `sitemap.xml`, `llms.txt`.

---

## IMPORTANT data check before you ship

The live FAQ in index.html (line ~348) currently says "A 30-day free trial, then $29 per year."
The product brief and this plan use "7-day free trial, then $29/year." These contradict each other.
Pick ONE and make it consistent across index.html FAQ, the JSON-LD below (`offers`), and llms.txt.
The JSON-LD below is written for the 7-day trial. If you keep 30-day on the site, change the FAQ
answer in the FAQPage schema AND fix the visible FAQ. Mismatched numbers hurt trust and can get
rich results flagged.

---

## 1. Ready-to-paste `<head>` block for index.html

Replace the current `<title>`, the three existing `<meta>` description/OG lines, and the
`theme-color` line (index.html lines 6 to 11) with the block below. Keep the existing
`<meta charset>` and `<meta name="viewport">` (lines 4 to 5) and the font `<link>` tags.
Paste this block immediately after the viewport meta. Update the two image URLs once the
OG image exists (see section 4).

```html
<!-- Primary -->
<title>Pawlogue: Honest Two-Way Cat Translator. Talk With Your Cat</title>
<meta name="description" content="Pawlogue is the first honest two-way cat translator. It reads your cat's mood and sounds, learns your cat's own meows, and helps you answer back with cues cats actually respond to. No fake sentences. 7-day free trial, then $29/year. iOS and Android." />
<link rel="canonical" href="https://pawlogue.pet/" />
<meta name="theme-color" content="#12100E" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta name="author" content="Visanow AI, Inc." />

<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Pawlogue" />
<meta property="og:title" content="Pawlogue: have a real, honest conversation with your cat" />
<meta property="og:description" content="The first honest two-way cat translator. Reads your cat, learns your cat's own meows, and helps you answer back with cues cats actually respond to. No fake sentences. iOS and Android." />
<meta property="og:url" content="https://pawlogue.pet/" />
<meta property="og:locale" content="en_US" />
<meta property="og:image" content="https://pawlogue.pet/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Pawlogue app showing a cat's meow read honestly as a mood, with a reply cue." />

<!-- Twitter / X Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Pawlogue: honest two-way cat translator" />
<meta name="twitter:description" content="Reads your cat, learns your cat's own meows, helps you answer back with cues cats actually respond to. No fake sentences. 7-day free trial, then $29/year." />
<meta name="twitter:image" content="https://pawlogue.pet/og-image.png" />
<meta name="twitter:image:alt" content="Pawlogue app showing a cat's meow read honestly as a mood, with a reply cue." />

<!-- JSON-LD: Organization -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://pawlogue.pet/#org",
  "name": "Visanow AI, Inc.",
  "url": "https://pawlogue.pet/",
  "logo": "https://pawlogue.pet/app/icon-512.png",
  "brand": {
    "@type": "Brand",
    "name": "Pawlogue"
  },
  "email": "hello@pawlogue.pet"
}
</script>

<!-- JSON-LD: SoftwareApplication (the Pawlogue app) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://pawlogue.pet/#app",
  "name": "Pawlogue",
  "applicationCategory": "LifestyleApplication",
  "applicationSubCategory": "Pet care / animal communication",
  "operatingSystem": "iOS, Android",
  "url": "https://pawlogue.pet/",
  "description": "Pawlogue is the first honest two-way translator for cats. It reads your cat's mood and the sounds reliable across cats, learns the meaning of your own cat's meows that you teach it, and helps you answer back with cues cats demonstrably respond to. It does not invent human sentences and is not veterinary advice.",
  "publisher": { "@id": "https://pawlogue.pet/#org" },
  "offers": {
    "@type": "Offer",
    "price": "29.00",
    "priceCurrency": "USD",
    "description": "7-day free trial, then $29 per year. One simple price, no ads.",
    "category": "Annual subscription"
  },
  "featureList": [
    "Reads cat mood and cross-cat reliable sounds (purr, hiss, growl, yowl, trill)",
    "Learns the meanings you teach for your specific cat",
    "Two-way: reply with cues cats respond to (trill, pspsps, name, slow blink, feeding call)",
    "Tracks the honest hit rate of each cue on your cat",
    "On-device audio processing by default",
    "Record and share honest clips"
  ]
}
</script>

<!-- JSON-LD: FAQPage (mirrors the on-page FAQ) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Does Pawlogue translate meows into words?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No, and it will never pretend it does. Pawlogue reads mood, the sounds that are reliable across cats, and the specific meanings you teach it for your own cat. Anyone claiming a literal word-for-word pet translator is selling a toy."
      }
    },
    {
      "@type": "Question",
      "name": "How can I talk back to my cat honestly?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You pick from a small set of cues cats actually respond to: a trill, the pspsps sound, a slow blink prompt, the feeding call, your cat's name, or your own voice. Pawlogue plays or coaches the cue and tracks whether your cat reacted. It never claims your cat understood a sentence, only what really happened."
      }
    },
    {
      "@type": "Question",
      "name": "What is the orange highlight in Pawlogue?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "If you try a cue your cat has not learned yet, Pawlogue marks it in orange: not in your cat's dictionary yet. It is an honest 'your cat does not know this one' rather than a fake success."
      }
    },
    {
      "@type": "Question",
      "name": "How does Pawlogue learn my specific cat?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Over the first week or two, the app groups your cat's sounds and asks you to name a few (for example, this one means hungry). About thirty quick taps, and the read keeps getting sharper as you go."
      }
    },
    {
      "@type": "Question",
      "name": "Is my cat's audio private?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Sound is processed on your device by default. Nothing leaves your phone unless you opt in, and even then only anonymized data is shared, never raw recordings, and never for sale."
      }
    },
    {
      "@type": "Question",
      "name": "Is Pawlogue veterinary or medical advice?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Pawlogue can gently flag an unusual pattern worth a vet's attention, but it never diagnoses. If your cat seems unwell, see a veterinarian."
      }
    },
    {
      "@type": "Question",
      "name": "What does Pawlogue cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A 7-day free trial, then $29 per year. One simple price. No ads."
      }
    },
    {
      "@type": "Question",
      "name": "When can I use Pawlogue?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "It is in build for iOS and Android. Join the waitlist to be among the first into the beta, cats first."
      }
    }
  ]
}
</script>
```

Notes:
- Canonical is self-referential (`https://pawlogue.pet/`). Good for a single-page landing.
- `max-image-preview:large` lets Google show the large thumbnail in results and AI Overviews.
- The three JSON-LD blocks are linked by `@id` so crawlers see Organization, App, and FAQ as one graph.
- If you keep the 30-day trial on the visible page, change the price answer above and the `offers.description` to match. Schema must not contradict visible text.

---

## 2. Target keyword map

### Primary (head terms, high intent)
| Keyword | Why | Where to place |
| --- | --- | --- |
| honest cat translator | Core differentiator, low competition, owns the niche | Title, H1 support line, llms.txt, FAQ |
| cat translator app | High volume, the category term | Title, meta description, an H2 |
| talk to your cat app | Matches the two-way hook, buyer intent | H1 area, meta description |
| cat meow translator | High search volume | An H2 plus body |
| cat sound translator | Variant volume | Body, feature list |

### Long-tail (lower volume, higher conversion, easier to rank)
| Keyword | Where to place |
| --- | --- |
| what is my cat saying | New H2 or FAQ question, strong AEO match |
| two-way cat translator | "The dialogue" section, llms.txt |
| app that learns my cat's meows | "How it works" step 2 copy |
| how to talk back to your cat | FAQ, "The dialogue" section |
| cat translator that actually works | Honesty section, review-style copy |
| is there a real cat translator | FAQ question, AEO |
| cat communication app on-device privacy | Privacy section, feature list |
| cat translator no fake sentences | Honesty section |

### AEO question phrasings (target for ChatGPT, Claude, Perplexity, Google AI Overviews)
Write a short, directly quotable answer (40 to 60 words) for each of these. LLMs lift clean,
self-contained answer paragraphs. These already live partly in llms.txt and the FAQ; mirror them on-page.
- "What is Pawlogue?"
- "Is there an honest cat translator?"
- "What is the best app to understand what my cat is saying?"
- "Can an app really translate cat meows?"
- "How do I talk back to my cat?"
- "Is the cat translator accurate?" (answer with the honesty / hit-rate framing)
- "Is Pawlogue safe / private?"
- "How much does Pawlogue cost?"

AEO rule of thumb: each answer should be true standalone, name "Pawlogue" explicitly in the first
sentence, and avoid hype words. LLMs prefer specific, falsifiable claims ("reads mood and cross-cat
sounds; learns your cat's meows; 7-day trial then $29/year") over adjectives.

---

## 3. On-page recommendations

### Headings (H1 to H3)
- Keep a single H1. Current H1 ("Have a real conversation with your cat.") is good for brand voice
  but weak for SEO because it lacks "translator." Either:
  - Option A (recommended): keep the emotional H1, and make sure the H2s carry the keywords.
  - Option B: add a keyword-bearing subhead right under H1, for example a visible line
    "The first honest cat translator: read your cat, teach its meows, answer back."
- Tighten H2s so they contain target terms. Current H2s are evocative but keyword-thin. Suggested:
  - "It listens. You answer." stays, but add a keyword line: "A true two-way cat translator."
  - "A shared dictionary that grows from day one." add: "How the cat meow translator learns your cat."
  - New H2 worth adding: "What is my cat saying?" (directly targets a high-intent query and AEO).
- Do not stack multiple H1s. The current page has one H1, keep it that way.

### Alt text (currently missing, all visuals are decorative CSS)
The page has no real `<img>` elements (logo, waveform, phone mock are all CSS), so there is nothing
to alt-tag today. Two actions:
- When you add the OG image and any screenshots, give every `<img>` descriptive alt text that
  includes a keyword naturally, for example: `alt="Pawlogue cat translator app reading a meow as a calm mood"`.
- The decorative CSS waveform and phone already use `aria-hidden="true"`. Good, leave them.

### Internal linking
- Add a visible link to the web app: the nav or hero should link to `/app/` with anchor text like
  "Try the web app" or "Open Pawlogue". Right now `/app/` is in the sitemap but not linked from the
  landing page, which weakens its discovery and crawl priority.
- Footer already links to `/privacy.html`. Good. Consider linking llms.txt is NOT needed (crawlers
  find it by convention at the root).
- Keep the in-page anchor nav (#dialogue, #how, #honest, #faq). Those help section-level snippets.

### Content gaps (to rank and to be quoted by LLMs)
- Add a short, plain-language "What is my cat saying?" block. This is the single highest-intent
  query in the niche and you have no dedicated section for it.
- Add a one-line definition sentence near the top that an LLM can lift verbatim:
  "Pawlogue is the first honest two-way cat translator: it reads your cat, learns your cat's own
  meows, and helps you answer back with cues cats actually respond to." (Mirrors llms.txt summary.)
- Consider a small comparison or honesty callout: "Why most cat translator apps are fake, and what
  honest looks like." This wins the "cat translator that actually works" and "no fake sentences"
  long-tails and is highly quotable.
- A future blog or notes section (even 3 to 5 short evergreen posts: "what a cat purr means",
  "what is pspsps", "do slow blinks work") would expand keyword surface and give LLMs more to cite.
  Each post = one URL, add to sitemap when published.
- Keep claims falsifiable and specific. LLMs down-rank and avoid quoting vague marketing language.

### Technical
- robots.txt, sitemap.xml, llms.txt are now in place at the root. After deploy, verify they resolve:
  https://pawlogue.pet/robots.txt , /sitemap.xml , /llms.txt
- Submit the sitemap in Google Search Console and Bing Webmaster Tools once verified.
- GitHub Pages serves these static files automatically from the repo root. No config needed.
- Page speed is already strong (single file, system fonts fallback). Keep it that way: do not add
  heavy scripts. Self-host the Google Fonts only if you later need to cut the two preconnects.

---

## 4. OG share image spec

Create `og-image.png` at the site root (`C:\Users\tonko\Documents\CatTranslator\site\og-image.png`),
referenced by the head block above as `https://pawlogue.pet/og-image.png`.

- Dimensions: 1200 x 630 px (the standard 1.91:1 OG ratio). This is the single most-shared size and
  renders correctly on iMessage, X, LinkedIn, Facebook, Slack, WhatsApp.
- Format: PNG (or high-quality JPG under ~300 KB for fast unfurls).
- Safe zone: keep text and the logo within the central ~1140 x 570 area; some platforms crop edges.
- What it should show:
  - The Pawlogue wordmark (with the small amber/teal waveform mark) top-left.
  - A short, honest hook in the brand serif (Fraunces): "Talk with your cat. Honestly." or
    "The honest cat translator."
  - A visual that signals the two-way idea: a cat meow bubble ("short, rising meow") read as a mood
    ("seeking attention, calm"), and a reply cue chip ("feeding call + name"). Reuse the site's
    dialogue-bubble look so it matches the landing page.
  - Brand colors: ink background (#12100E), cream text (#F2E8D5), amber accent (#E8A657),
    teal accent (#2D8B7A). No em-dashes in any on-image text.
  - Do not overload it: one headline, the wordmark, one small visual. It must read at thumbnail size.
- Optional: also export a 1080 x 1080 square version for Instagram if you plan to post there, but
  the 1200 x 630 is what the meta tags reference.
