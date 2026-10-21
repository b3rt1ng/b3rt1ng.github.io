/* Everything editable about the site lives here. No build step: add an entry,
   reload. Plain data only, rendered by site.js. */

// Leave a url empty and that link renders inert ("soon") instead of dead.
const HTB_URL = 'https://app.hackthebox.com/users/361363';

// The writeups page reads this repo live on every visit, so anything pushed
// there shows up without touching the site.
const WRITEUPS_REPO = {
  owner: 'b3rt1ng',
  name: 'Writeup',
  branch: 'main',
  // Platforms named here are listed first, in this order. Anything else
  // follows alphabetically.
  order: ['HackTheBox'],
};

const PROFILE = {
  handle: 'b3rt1ng',
  role: 'security researcher · offensive tool builder · CTF player',
};

const PROJECTS = [
  {
    name: 'koi',
    tagline: 'The serene shell handler',
    status: 'active',
    version: '0.12.0',
    stack: ['Python 3.10+', 'Linux', 'Windows'],
    summary:
      'A fast, feature-rich reverse shell handler with an interface that is actually pleasant to look at. ' +
      'Handles multiple sessions, upgrades them to full PTYs, and pivots through them.',
    highlights: [
      ['Multi-session', 'List, switch and background reverse shells without dropping any.'],
      ['PTY upgrade', 'Raw shell to full PTY — tab completion, Ctrl+C forwarding, terminal resizing.'],
      ['Tunneling', 'Turn a shell into a Layer 3 pivot: userland TCP stack on the target, no root, no dropped binary.'],
      ['Obfuscator', 'Chainable payload obfuscation (XOR, hex, format strings, char arrays) to get past Defender.'],
      ['Modules', 'Post-exploitation, file transfer, enumeration, AD collection — extensible with your own.'],
      ['MCP server', 'Expose sessions and modules to an LLM client, read-only by default.'],
      ['Session logging', 'Every session recorded automatically, replayable with koireview.'],
      ['Screenable mode', 'Masks IPs and MACs so you can stream or demo safely.'],
    ],
    links: [
      ['source', 'https://github.com/b3rt1ng/Koi'],
      ['docs', 'https://b3rt1ng.github.io/koi-wiki/'],
      ['pypi', 'https://pypi.org/project/koi-handler/'],
    ],
    install: 'pipx install koi-handler',
  },
];

// Leads the landing icon row, ahead of the external profiles. Same shape as
// SOCIALS; `internal` keeps it from opening in a new tab.
const SITE_LINKS = [
  {
    name: 'Tools',
    icon: 'tools',
    handle: 'what I build',
    url: 'tools.html',
    internal: true,
  },
  {
    name: 'Writeups',
    icon: 'writeups',
    handle: 'CTF and HackTheBox',
    url: 'writeups.html',
    internal: true,
  },
];

// `icon` picks one of the inline SVGs in site.js: writeups | github | htb | x
const SOCIALS = [
  {
    name: 'GitHub',
    icon: 'github',
    handle: '@b3rt1ng',
    url: 'https://github.com/b3rt1ng',
    note: 'tools, experiments, dotfiles',
  },
  {
    name: 'HackTheBox',
    icon: 'htb',
    handle: '@b3rt1ng',
    url: HTB_URL,
    note: 'machines, challenges, write-ups',
  },
  {
    name: 'X',
    icon: 'x',
    handle: '@b3rt1ng_sec',
    url: 'https://x.com/b3rt1ng_sec',
    note: 'shorter thoughts',
  },
];

/* Blog posts, newest first.

   body blocks:
     'text'                  paragraph
     { h: 'Heading' }        sub-heading
     { list: ['a', 'b'] }    bullet list
     { code: '...', lang: 'bash' }   code block                              */
const POSTS = [
  {
    slug: 'building-koi',
    title: 'Why I wrote my own shell handler',
    date: '2026-10-20',
    tags: ['koi', 'tooling', 'python'],
    excerpt:
      'Existing handlers either did too much or looked like they were written in 1998. Here is what I wanted instead.',
    body: [
      'This is a placeholder post so you can see how the blog renders. Delete it and write your own — everything lives in js/data.js.',
      { h: 'What a block looks like' },
      'A plain string is a paragraph. Objects give you headings, lists and code.',
      { list: [
        'Lists are useful for feature breakdowns.',
        'Each entry is just a string.',
      ] },
      { code: 'pipx install koi-handler\nkoi --help', lang: 'bash' },
      'Each post gets a shareable anchor, so #building-koi opens this one directly.',
    ],
  },
];

/* Tools, shown as a "choose your character" grid on tools.html.

   body: same block format as the blog — string | {h} | {list} | {code}      */
const TOOLS = [
  {
    slug: 'octocrawl',
    name: 'octocrawl',
    klass: 'Crawler / Fuzzer',
    scene: 'octopus',
    sigil: 'octopus',   // baked art from sigil-art.js, not the procedural crest
    repo: 'b3rt1ng/Octocrawl',   // live star count is pulled from here
    tagline: 'Website crawler and fuzzer',
    status: 'Maintained',
    version: '1.5.5',
    stack: ['Python 3.10+', 'asyncio', 'MIT'],
    summary:
      'A lightweight asynchronous web crawler for recon. Concurrent workers walk a site ' +
      'in parallel, check every resource they find, and hand back the architecture as a ' +
      'tree you can actually read in the terminal.' +
      'I ended up making it a fuzzer since the architecture is already there, and I wanted a kind of all in-one tool',
    highlights: [
      ['Async crawling', 'asyncio with concurrent workers.'],
      ['Status checks', 'Verifies the status code of every resource it discovers.'],
      ['Keyword search', 'Scans text-based files for a list of terms you give it.'],
      ['Cookie handling', 'Pass cookies through to crawl behind authentication.'],
      ['Tree restitution', 'Draws the site architecture as a tree, right in the terminal.'],
      ['Module API', 'Run your own post-crawl scripts over the results.'],
    ],
    install: 'pipx install octocrawl',
    links: [
      ['source', 'https://github.com/b3rt1ng/Octocrawl'],
      ['pypi', 'https://pypi.org/project/octocrawl/'],
    ],
    body: [
      { h: 'Why an octopus' },
      'Eight arms reaching down different paths at once is what concurrent crawling ' +
      'actually looks like, which is where the name came from. The background on this ' +
      'page is the same idea: each arm moves on its own cadence, reaching out and ' +
      'drawing back, none of them in step.',
      { h: 'Getting started' },
      { code: 'octocrawl -u https://example.com', lang: 'bash' },
      { h: 'Examples' },
      { code:
        'octocrawl https://example.com\n' +
        'octocrawl https://example.com -w 40 --stealth\n' +
        'octocrawl https://example.com -d .js,.json --fullpath\n' +
        'octocrawl https://example.com -k "password,api_key"\n' +
        'octocrawl https://example.com -c "session=abc123"\n' +
        'octocrawl https://example.com -i .png,.svg -o out.txt\n' +
        'octocrawl https://example.com --no-robots --no-sitemap\n' +
        'octocrawl https://example.com -M mymodule\n' +
        'octocrawl --list-modules\n' +
        'octocrawl fuzz https://example.com/FUZZ -w words.txt\n' +
        'octocrawl fuzz https://example.com/FUZZ -w w.txt -e .php\n' +
        'octocrawl fuzz https://example.com/FUZZ -w w.txt -mc all',
        lang: 'bash' },
    ],
  },
  {
    slug: 'koi',
    name: 'koi',
    klass: 'Reverse Shell',
    scene: 'koi',
    sigil: 'koi',       // koi's own CLI art, baked into sigil-art.js
    repo: 'b3rt1ng/Koi',       // live star count is pulled from here
    tagline: 'The low cortisol shell handler.',
    status: 'Maintained',
    version: '0.12.0',
    stack: ['Python 3.10+', 'Linux + Windows', 'GPL-3.0'],
    summary:
      'A fast, feature-rich reverse shell handler with an interface that is actually ' +
      'pleasant to look at. Handles multiple sessions, upgrades them to full PTYs, ' +
      'and pivots through them.',
    highlights: [
      ['Multi-session', 'List, switch and background reverse shells without dropping any.'],
      ['PTY upgrade', 'Raw shell to full PTY \u2014 tab completion, Ctrl+C forwarding, terminal resizing.'],
      ['Tunneling', 'Turn a shell into a Layer 3 pivot: userland TCP stack on the target, no root, no dropped binary.'],
      ['Obfuscator', 'Chainable payload obfuscation (XOR, hex, format strings, char arrays) to get past Defender.'],
      ['Modules', 'Post-exploitation, file transfer, enumeration, AD collection \u2014 extensible with your own.'],
      ['MCP server', 'Expose sessions and modules to an LLM client, read-only by default.'],
      ['Session logging', 'Every session recorded automatically, replayable with koireview.'],
      ['Screenable mode', 'Masks IPs and MACs so you can stream or demo safely.'],
    ],
    install: 'pipx install koi-handler',
    links: [
      ['source', 'https://github.com/b3rt1ng/Koi'],
      ['docs', 'https://b3rt1ng.github.io/koi-wiki/'],
      ['pypi', 'https://pypi.org/project/koi-handler/'],
    ],
    body: [
      { h: 'What it does' },
      'Catches reverse shells, upgrades them to full PTYs, and keeps as many as you ' +
      'need side by side. From there it pivots: a userland TCP stack on the target ' +
      'turns a shell into a Layer 3 route, with no root and no binary dropped on disk.',
      { h: 'Getting started' },
      { code: 'koi --help', lang: 'bash' },
      { h: 'Examples' },
      { code:
        'koi -p 4444\n' +
        'koi --host 10.10.14.3 -p 443\n' +
        'koi --payloads eth0\n' +
        'koi --cook eth0\n' +
        'koi --no-log --strip-history\n' +
        'koi --local-prepare\n' +
        'koi --local\n' +
        'koi --mcp\n' +
        'koi --mcp --mcp-allow-exec --mcp-port 7331\n' +
        'koifuscator eth0 -p 4444\n' +
        'koireview <log>',
        lang: 'bash' },
    ],
  },
];
