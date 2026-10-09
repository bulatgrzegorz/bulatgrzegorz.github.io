// Content for the About / CV page. Keep entries scannable: a one-line
// headline is always visible, `details` only appear when expanded.

export type Client = { name: string; url: string; logo: string };

export type Job = {
  period: string;
  company: string;
  role: string;
  headline: string;
  url?: string;
  logo?: string;
  /** Products or clients, shown on the collapsed card. */
  clients?: Client[];
  tags: string[];
  details: { title?: string; url?: string; items: string[] }[];
};

export type Project = {
  name: string;
  headline: string;
  tags: string[];
  details: string;
  repo: string;
  live?: { label: string; url: string };
};

export const facts = [
  { value: "10+", label: "years building back-end systems" },
  { value: "5", label: "companies, fintech to debt collection" },
  { value: "Wrocław", label: "Poland" },
];

export const domains = [
  "Fintech & banking",
  "Trading",
  "Leasing",
  "Debt collection",
];

export const jobs: Job[] = [
  {
    period: "2022 — now",
    company: "StoneX",
    url: "https://www.stonex.com",
    logo: "/assets/img/logos/stonex.png",
    role: "Senior C# .NET Developer",
    headline:
      "Back-end and API logic for online trading platforms — and moving them to the cloud.",
    clients: [
      {
        name: "FOREX.com",
        url: "https://www.forex.com",
        logo: "/assets/img/logos/forex.png",
      },
      {
        name: "City Index",
        url: "https://www.cityindex.com",
        logo: "/assets/img/logos/cityindex.png",
      },
      {
        name: "MetaTrader",
        url: "https://www.metatrader5.com",
        logo: "/assets/img/logos/metatrader5.png",
      },
      {
        name: "TradingView",
        url: "https://www.tradingview.com",
        logo: "/assets/img/logos/tradingview.png",
      },
    ],
    tags: [
      "Trading APIs",
      "Distributed systems",
      "Caching",
      "CI/CD",
      "Architecture",
    ],
    details: [
      {
        title: "Trading platforms",
        items: [
          "Back-end and API logic for the FOREX.com, City Index and MetaTrader apps.",
          "Worked on the TradingView integration project.",
        ],
      },
      {
        title: "Performance & architecture",
        items: [
          "Designed, built and supported API caching with sub-millisecond response times.",
          "Designing and implementing high-performance, distributed financial systems.",
          "Created architecture plans, including migrating legacy systems to the cloud.",
        ],
      },
      {
        title: "Delivery & reliability",
        items: [
          "Built and maintained CI/CD pipelines.",
          "Organised observability for analysis and alerting.",
          "Automated tests for existing and new systems.",
        ],
      },
    ],
  },
  {
    period: "2021 — 2022",
    company: "Spyrosoft S.A.",
    url: "https://spyrosoft.com",
    logo: "/assets/img/logos/spyrosoft.png",
    role: "Senior C# .NET Developer",
    headline:
      "Client projects in parking software and investment research: deployments, reporting, performance.",
    clients: [
      {
        name: "ParkingEye",
        url: "https://www.parkingeye.co.uk",
        logo: "/assets/img/logos/parkingeye.png",
      },
      {
        name: "Redburn (Rothschild & Co)",
        url: "https://ideas.redburn.rothschildandco.com/home/about-redburn",
        logo: "/assets/img/logos/rothschildandco.png",
      },
    ],
    tags: ["DB deployments", "Build automation", "Reporting", "Performance"],
    details: [
      {
        title: "ParkingEye",
        url: "https://www.parkingeye.co.uk",
        items: [
          "Rebuilt the database deployment system, making migrations standardised and automated.",
          "Built an automation module for reporting.",
        ],
      },
      {
        title: "Redburn (Rothschild & Co)",
        url: "https://ideas.redburn.rothschildandco.com/home/about-redburn",
        items: [
          "Refactored their distributed reporting system and fixed its performance issues.",
          "Made processes resilient: jobs that stopped on an error now retry and carry on.",
        ],
      },
    ],
  },
  {
    period: "2017 — 2021",
    company: "Krajowy Rejestr Długów BIG",
    url: "https://www.krd.pl",
    logo: "/assets/img/logos/krd.png",
    role: "Senior C# .NET Developer",
    headline:
      "Debt collection system for Kaczmarski Inkaso, and the back-end of wingo.pl.",
    clients: [
      {
        name: "Kaczmarski Inkaso",
        url: "https://kaczmarskigroup.pl",
        logo: "/assets/img/logos/kaczmarskigroup.png",
      },
      {
        name: "wingo.pl",
        url: "https://wingo.pl",
        logo: "/assets/img/logos/wingo.png",
      },
    ],
    tags: ["Debt collection", "Email & SMS", "ETL", "CI/CD"],
    details: [
      {
        title: "Kaczmarski Inkaso",
        url: "https://kaczmarskigroup.pl",
        items: [
          "Maintained and developed the debt collection system.",
          "Refactored the email and SMS distribution systems: better performance, plus efficiency metrics.",
          "Led an internal ETL project for data import and transformation.",
        ],
      },
      {
        title: "wingo.pl",
        url: "https://wingo.pl",
        items: [
          "Built the back-end of wingo.pl — submit a debt for collection quickly and easily.",
        ],
      },
      {
        title: "Delivery",
        items: [
          "Co-authored the CI/CD pipelines.",
          "Owned implementation and delivery of the final solution.",
        ],
      },
    ],
  },
  {
    period: "2016 — 2017",
    company: "Getin Leasing",
    logo: "/assets/img/logos/getin.png",
    role: "C# .NET Developer",
    headline: "Internal debt collection and monitoring modules.",
    tags: ["Leasing", "Databases"],
    details: [
      {
        items: [
          "Maintained and extended debt collection and monitoring modules.",
          "Designed and optimised databases for performance and reliability.",
          "Refined system requirements with business stakeholders.",
        ],
      },
    ],
  },
  {
    period: "2015 — 2016",
    company: "Getin Bank",
    logo: "/assets/img/logos/getin.png",
    role: "IT System Analyst",
    headline: "Business analysis, database design and custom reporting.",
    tags: ["Banking", "Analysis", "Reporting"],
    details: [
      {
        items: [
          "Analysed business requirements and wrote system documentation.",
          "Designed databases and implemented custom reports.",
          "Ran training sessions for product teams and gathered feedback for next stages.",
        ],
      },
    ],
  },
];

export const projects: Project[] = [
  {
    name: "Sharp Dependency",
    headline: "Automated dependency updates for .NET projects.",
    tags: ["C#", ".NET", "CLI"],
    details:
      "A tool that finds outdated NuGet dependencies across .NET projects and updates them for you.",
    repo: "https://github.com/bulatgrzegorz/sharp-dependency",
  },
  {
    name: "Trail Bud",
    headline: "Trail-race nutrition planner that runs in your browser.",
    tags: ["TypeScript", "GPX", "Vibe coded"],
    details:
      "Upload a GPX route, add aid stations, set timing, flasks and gels — get a deterministic hydration and carb timeline drawn on the route. Everything stays local.",
    repo: "https://github.com/bulatgrzegorz/trail-bud",
    live: {
      label: "Open app",
      url: "https://bulatgrzegorz.github.io/trail-bud/",
    },
  },
  {
    name: "GPX Bud",
    headline: "GPX routes as slope charts — spot the hard parts.",
    tags: ["JavaScript", "GPX", "Charts"],
    details:
      "Visualises a .gpx file as a slope chart, so the steep sections of your next trip are obvious at a glance.",
    repo: "https://github.com/bulatgrzegorz/gpx-bud",
    live: {
      label: "Open app",
      url: "https://bulatgrzegorz.github.io/gpx-bud/",
    },
  },
  {
    name: "Test ID Generator",
    headline: "Deterministic random IDs for tests.",
    tags: ["C#", "Testing", "Library"],
    details:
      "Generates random-looking but repeatable identifiers, so snapshot tests stay stable instead of breaking on new IDs every run.",
    repo: "https://github.com/bulatgrzegorz/test-id-generator",
  },
  {
    name: "Sharpoogle",
    headline: "Search C# code by method signature.",
    tags: ["C#", "Search", "NuGet"],
    details:
      "A fun experiment: a search engine for C# codebases where you query by signature, e.g. (string, int) → bool.",
    repo: "https://github.com/bulatgrzegorz/sharpoogle",
    live: { label: "NuGet", url: "https://www.nuget.org/packages/sharpoogle/" },
  },
];

export const skillGroups = [
  {
    name: "Core",
    items: ["C# / .NET", "ASP.NET Core", "Entity Framework", "SQL", "NoSQL"],
  },
  {
    name: "Cloud & containers",
    items: ["Azure", "Kubernetes", "Helm", "Docker", "Ingress"],
  },
  {
    name: "Messaging",
    items: ["Azure Service Bus", "ActiveMQ", "Kafka"],
  },
  {
    name: "Observability",
    items: [
      "OpenTelemetry",
      "Grafana",
      "ELK",
      "OpenSearch",
      "Jaeger",
      "Datadog",
    ],
  },
  {
    name: "CI/CD",
    items: ["GitHub Actions", "Azure DevOps", "TeamCity", "Octopus"],
  },
  {
    name: "AI in engineering",
    items: [
      "Coding agents",
      "AI code-review agents",
      "LLM workflows",
      "MCP servers",
    ],
  },
];

export const strengths = [
  {
    title: "Distributed systems",
    text: "Microservices and event-driven architectures designed for scale.",
  },
  {
    title: "AI-assisted delivery",
    text: "LLMs and coding agents across the lifecycle, incl. AI PR-review agents.",
  },
  {
    title: "Developer tooling",
    text: "Tools and libraries that make other developers faster.",
  },
  {
    title: "People & process",
    text: "Requirements, documentation, planning and mentoring teammates.",
  },
];

export const education = {
  period: "2012 — 2016",
  school: "Wrocław University of Science and Technology",
  field: "Mathematics",
};

export const languages = ["Polish — native", "English — fluent"];
