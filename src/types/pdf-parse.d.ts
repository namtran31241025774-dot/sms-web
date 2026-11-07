declare module "pdf-parse/lib/pdf-parse.js" {
  export default function parse(data: Buffer): Promise<{ text: string }>;
}
