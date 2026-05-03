export interface LanguageConfig {
  name: string;
  extensions: string[];
  frameworkHints?: Record<string, string>;
}

export const LANGUAGES: LanguageConfig[] = [
  {
    name: "typescript",
    extensions: [".ts", ".tsx"],
    frameworkHints: {
      "app/": "nextjs",
      "pages/": "nextjs",
      "*.page.tsx": "nextjs",
      "*.component.tsx": "angular",
    },
  },
  {
    name: "javascript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
  },
  {
    name: "python",
    extensions: [".py"],
    frameworkHints: {
      "settings.py": "django",
      "main.py": "fastapi",
    },
  },
  {
    name: "go",
    extensions: [".go"],
  },
  {
    name: "dart",
    extensions: [".dart"],
    frameworkHints: {
      "lib/": "flutter",
      "*.widget.dart": "flutter",
    },
  },
  {
    name: "astro",
    extensions: [".astro"],
    frameworkHints: {
      "src/pages/": "astro",
      "src/components/": "astro",
    },
  },
  {
    name: "rust",
    extensions: [".rs"],
  },
  {
    name: "java",
    extensions: [".java"],
    frameworkHints: {
      "Application.java": "spring",
    },
  },
  {
    name: "kotlin",
    extensions: [".kt", ".kts"],
    frameworkHints: {
      "Application.kt": "spring",
      "MainActivity.kt": "android",
    },
  },
  {
    name: "swift",
    extensions: [".swift"],
  },
  {
    name: "ruby",
    extensions: [".rb"],
    frameworkHints: {
      "app/controllers/": "rails",
      "app/models/": "rails",
    },
  },
  {
    name: "php",
    extensions: [".php"],
  },
  {
    name: "css",
    extensions: [".css", ".scss", ".sass"],
  },
];

export function detectLanguage(filePath: string): LanguageConfig | null {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return null;
  const ext = filePath.slice(lastDot).toLowerCase();
  return LANGUAGES.find((l) => l.extensions.includes(ext)) ?? null;
}

export function detectFramework(filePath: string, lang: LanguageConfig): string | null {
  if (!lang.frameworkHints) return null;
  for (const [pattern, framework] of Object.entries(lang.frameworkHints)) {
    if (filePath.includes(pattern.replace("*", ""))) return framework;
  }
  return null;
}
