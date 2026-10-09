import * as cl from "@us-legal-tools/courtlistener-sdk";

/** Indicates the type of HTML for a court opinion provided by CourtListener. */
export type HTMLFormat = "rich-text" | "plain-text";

/** Contains all the information relevant to a given opinion. */
export interface FullOpinion {
	/** Metadata about ruling from the search functionality. */
	caseMeta: cl.SearchResult;

	/** Metadata about the opinion itself. */
	opinionMeta: cl.Opinion;

	/** The content of the opinion, parsed into a DOM object. */
	opinionBody: HTMLElement;

	/** Whether the opinion is plain text or rich text. */
	opinionFormat: HTMLFormat;
}

/**
 * Calls the CourtListener API to search for opinions.
 * @param caseName - The name of the case to search for. Does not need to be an exact match.
 * @returns A list of search results from the API.
 * @throws If the API request fails or times out.
 */
export async function searchOpinions(
	caseName: string,
): Promise<cl.SearchResult[]> {
	const results = await cl.getSearch({
		type: "o",
		q: `caseName:${caseName}`,
	});
	return results.results?.filter((result) => result.judge !== "") || [];
}

/**
 * Calls the CourtListener to get additional context on a case.
 * This method heuristically selects the best opinion to load from the case.
 * 
 * @param caseMeta - The case to load.
 * @returns The full opinion, or `undefined` if invalid for any reason.
 * @throws If the API request fails or times out.
 */
export async function getFullOpinion(
	caseMeta: cl.SearchResult,
): Promise<FullOpinion | undefined> {
	if (!caseMeta.opinions || caseMeta.opinions.length === 0) {
		console.warn("Missing opinions");
		return;
	}

	const opinionSummary =
		caseMeta.opinions.length > 1
			? caseMeta.opinions.find((meta) => meta.type === "combined-opinion")
			: caseMeta.opinions[0];
	if (!opinionSummary) {
		console.warn("No opinion summary");
		return;
	}

	const opinionMeta = await cl.getOpinionsId(opinionSummary.id);

	const opinionBodyRaw = opinionMeta.html_with_citations;
	if (!opinionBodyRaw) {
		console.warn("Missing HTML with citations");
		return;
	}

	const opinionBody = new DOMParser().parseFromString(
		opinionBodyRaw,
		"text/html",
	).body;

	const opinionFormat =
		opinionMeta.xml_harvard !== "" || opinionMeta.html_lawbox !== ""
			? "rich-text"
			: "plain-text";

	return { caseMeta, opinionMeta, opinionBody, opinionFormat };
}
