import { TFolder, TFile, type App } from "obsidian";

/** 
 * The schema for properties of cases in the `Test` database.
 * This schema is editable, and you are allowed to add properties.
 */
export interface Metadata {
	base: "[[Test.base]]";
	Title: string;
	"In-Text Citation"?: string;
	Priority?: string;
	Court?: string;
	Authors?: string;
	"Zotero URI"?: string;
	Takeaway?: string;
	Tags?: string[];
	Category?: string[];
	Abstract?: string;
	Type?: string;
	Rating?: string;
	Year?: number;
	"Full Citation"?: string;
	"Last edited"?: Date;
	Full?: string;
	Status?: string;
	Date?: string;
	"Year*"?: number;
	Jurisdiction?: string;
}

export function loadCaseBase(app: App): Metadata[] {
	const folder = app.vault.getFolderByPath("Test")!;
	return folder.children.flatMap((row) => {
		let child: TFile;
		if (row instanceof TFolder) {
			child = row.children
				.filter<TFile>((child) => child instanceof TFile)
				.find((child) => child.basename === row.name)!;
		} else if (row instanceof TFile) {
			if (row.extension !== "md") return [];
			child = row;
		} else {
			throw Error("Unreachable");
		}

		const meta = app.metadataCache.getFileCache(child)!;
		if (!meta.frontmatter) throw Error(row.path);
		return meta.frontmatter as Metadata;
	});
}
