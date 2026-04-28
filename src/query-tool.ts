import { OVClient } from './client';
import { Type, Static } from '@sinclair/typebox';

export const QueryParamsSchema = Type.Object({
  action: Type.Union([
    Type.Literal('search'),
    Type.Literal('read'),
    Type.Literal('abstract'),
    Type.Literal('overview'),
    Type.Literal('list'),
    Type.Literal('session_context'),
  ]),
  query: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ default: 10 })),
});

export type QueryParams = Static<typeof QueryParamsSchema>;

export class QueryTool {
  constructor(private client: OVClient) {}

  get name(): string {
    return 'ov_query';
  }

  get description(): string {
    return 'Query the OpenViking knowledge base. Actions: search, read, abstract, overview, list, session_context.';
  }

  get schema() {
    return QueryParamsSchema;
  }

  async execute(params: QueryParams): Promise<unknown> {
    switch (params.action) {
      case 'search':
        return this.client.search(params.query ?? '', params.limit ?? 10);
      case 'read':
        return this.client.read(params.id ?? '');
      case 'abstract':
        return this.client.abstract(params.id ?? '');
      case 'overview':
        return this.client.overview(params.id ?? '');
      case 'list':
        return this.client.list(params.path ?? '');
      case 'session_context':
        return this.client.getSessionContext(params.id ?? '');
      default:
        throw new Error(`Unknown action: ${(params as QueryParams).action}`);
    }
  }
}
