import { apiClient } from './apiClient';

export interface SmartFilterRule {
  column: string;
  operator: 'equals' | 'contains' | 'not_equals' | 'is_empty';
  value: string;
}

export interface SmartSort {
  column: string;
  direction: 'asc' | 'desc';
}

export interface ParseQueryResponse {
  filters: SmartFilterRule[];
  search_keyword: string;
  sort: SmartSort | null;
}

export const matrixService = {
  async parseQuery(
    prompt: string,
    availableColumns?: string[],
    schemaOptions?: Record<string, string[]>
  ): Promise<ParseQueryResponse> {
    const payload: {
      prompt: string;
      available_columns?: string[];
      schema_options?: Record<string, string[]>;
    } = { prompt };
    if (availableColumns && availableColumns.length > 0) {
      payload.available_columns = availableColumns;
    }
    if (schemaOptions && Object.keys(schemaOptions).length > 0) {
      payload.schema_options = schemaOptions;
    }
    const result = await apiClient.post<ParseQueryResponse>(
      '/matrix/parse-query',
      payload,
      { timeout: 30000 }
    );
    return result;
  },
};

