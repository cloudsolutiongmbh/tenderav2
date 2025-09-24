declare module "mammoth/mammoth.browser" {
	export interface RawTextResult {
		value: string;
	}

	export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<RawTextResult>;

	const Mammoth: {
		extractRawText: typeof extractRawText;
	};

	export default Mammoth;
}
