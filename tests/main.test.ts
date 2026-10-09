// Basic rubric checks through the real plugin command; no CourtListener requests.
// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.courtlistener.com/"}
import { beforeEach, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import * as yaml from "yaml";
import type { FullOpinion } from "../src/courtlistener";

const state = vi.hoisted(() => ({ commands: [] as any[], modal: null as any }));
vi.mock("obsidian", () => {
  class TFile {
    extension = "md";
    basename: string;
    constructor(public path: string) {
      this.basename = path.split("/").at(-1)!.replace(/\.md$/, "");
    }
  }
  class TFolder {
    children: any[] = [];
    name: string;
    constructor(public path: string) { this.name = path.split("/").at(-1)!; }
  }
  return {
    TFile, TFolder,
    Plugin: class {
      constructor(public app: App) {}
      addCommand(command: any) { state.commands.push(command); }
    },
    SuggestModal: class {
      constructor(public app: App) {}
      open() { state.modal = this; }
    },
    debounce: (fn: any) => fn,
  };
});
vi.mock("../src/courtlistener", () => ({
  getFullOpinion: vi.fn(),
  searchOpinions: vi.fn(() => { throw new Error("Unexpected search"); }),
}));

import Plugin from "../src/main";
import { TFile, TFolder } from "obsidian";
import { getFullOpinion } from "../src/courtlistener";
import { loadCaseBase } from "../src/case-base";

const title = "Example v. State (2021)";
const MockFolder = TFolder as unknown as new (path: string) => TFolder;
const MockFile = TFile as unknown as new (path: string) => TFile;
let files: Map<string, string>;
let folders: Map<string, TFolder>;
let app: App;

beforeEach(() => {
  vi.clearAllMocks();
  state.commands = [];
  state.modal = null;
  // Fail closed if any code tries to use the network.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network disabled"); }));
  files = new Map();
  folders = new Map([["Test", new MockFolder("Test")]]);
  app = {
    vault: {
      getFolderByPath: (path: string) => folders.get(path),
      createFolder: vi.fn(async (path: string) => {
        const folder = new MockFolder(path);
        folders.set(path, folder);
        folders.get("Test")!.children.push(folder);
        return folder;
      }),
      create: vi.fn(async (path: string, contents: string) => {
        if (files.has(path)) throw new Error(`Duplicate file: ${path}`);
        files.set(path, contents);
        const file = new MockFile(path);
        folders.get(path.slice(0, path.lastIndexOf("/")))!.children.push(file);
        return file;
      }),
    },
    metadataCache: {
      getFileCache: (file: TFile) => {
        const content = files.get(file.path)!;
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        return { frontmatter: match ? yaml.parse(match[1]) : undefined };
      },
    },
    workspace: { getLeaf: () => ({ openFile: vi.fn() }) },
  } as unknown as App;
});

async function importOpinion(html: string) {
  const opinionBody = document.createElement("div");
  opinionBody.innerHTML = html;
  const fixture = {
    caseMeta: { caseName: "Example v. State", dateFiled: "2021-04-05", cluster_id: 123 },
    opinionMeta: { id: 456 },
    opinionBody,
    opinionFormat: "rich-text",
  } as FullOpinion;
  vi.mocked(getFullOpinion).mockResolvedValue(fixture);
  const plugin = new Plugin(app, {} as ConstructorParameters<typeof Plugin>[1]);
  await plugin.onload();
  const command = state.commands.find(command => command.name === "Load opinion");
  expect(command).toBeDefined();
  command.callback();
  await state.modal.onChooseSuggestion(fixture.caseMeta, {});
  // The provided implementation starts the import without awaiting it.
  await vi.waitFor(() => expect(files.has(`Test/${title}/Opinion.md`)).toBe(true));
  return files.get(`Test/${title}/Opinion.md`)!;
}

it("imports a titled Test entry with blank notes and an opinion", async () => {
  await importOpinion("<p>A short opinion.</p>");
  expect(folders.has(`Test/${title}`)).toBe(true);
  const notes = files.get(`Test/${title}/${title}.md`)!;
  expect(notes.replace(/^---\n[\s\S]*?\n---\n/, "").trim()).toBe("");
  expect(loadCaseBase(app)).toEqual([
    expect.objectContaining({ base: "[[Test.base]]", Title: title }),
  ]);
  expect(files.get(`Test/${title}/Opinion.md`)).toContain("A short opinion.");
});

it("converts headings, paragraphs, and emphasis to Markdown", async () => {
  const markdown = await importOpinion("<h2>Decision</h2><p>The <em>important</em> holding.</p>");
  expect(markdown).toMatch(/(?:## Decision|Decision\n-+)/);
  expect(markdown).toMatch(/The [*_]important[*_] holding\./);
  expect(markdown).not.toMatch(/<\/?(?:h2|p|em)\b/);
});

it("adds a block label for an opinion page number", async () => {
  const markdown = await importOpinion('<p><span class="star-pagination">*978</span> The holding.</p>');
  expect(markdown).toContain("The holding.");
  expect(markdown).toMatch(/\n\^978(?:\n|$)/);
});

it("links imported citations to the local opinion and page block", async () => {
  await app.vault.create("Test/Prior.md", '---\nbase: "[[Test.base]]"\nTitle: Prior v. State (2020)\nCourtListener ID: 42\n---\n');
  const markdown = await importOpinion('<p><span class="citation"><a href="/opinion/42/">Prior</a></span> and <span class="citation"><a href="/opinion/42/#978">Prior at 978</a></span></p>');
  expect(markdown).toContain("[[Prior v. State (2020)/Opinion|Prior]]");
  expect(markdown).toContain("[[Prior v. State (2020)/Opinion#^978|Prior at 978]]");
});

it("makes missing opinions external and preserves ordinary absolute links", async () => {
  const markdown = await importOpinion('<p><span class="citation"><a href="/opinion/99/#978">Other</a></span> and <a href="https://example.org/reference?q=law#section">Reference</a></p>');
  expect(markdown).toContain("[Other](https://www.courtlistener.com/opinion/99/#978)");
  expect(markdown).toContain("[Reference](https://example.org/reference?q=law#section)");
});
