import { seedMockFiles } from "../../../src/utils/mockAPI";
import { seedLexicalEmbeddings } from "../../../src/utils/embeddings";
import vault from "../data/real-vault.json";

const files = vault as Record<string, string>;
seedMockFiles(files);
seedLexicalEmbeddings(files);
