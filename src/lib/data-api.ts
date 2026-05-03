import { supabase } from "@/lib/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

type Primitive = string | number | boolean;

type FilterOp = "eq" | "is";

type Filter = {
  column: string;
  op: FilterOp;
  value: Primitive | null;
};

function buildUrl(table: string, params?: URLSearchParams) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  if (params) {
    params.forEach((value, key) => url.searchParams.set(key, value));
  }
  return url;
}

async function getHeaders(prefer?: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token ?? supabaseAnonKey;

  const headers: HeadersInit = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

function encodeFilterValue(value: Primitive | null) {
  if (value === null) {
    return "null";
  }

  return encodeURIComponent(String(value));
}

function applyFilters(params: URLSearchParams, filters: Filter[]) {
  filters.forEach(({ column, op, value }) => {
    params.set(column, `${op}.${encodeFilterValue(value)}`);
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Data API request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function selectRows<T>(
  table: string,
  options?: {
    select?: string;
    filters?: Filter[];
    order?: string;
  },
): Promise<T[]> {
  const params = new URLSearchParams();
  params.set("select", options?.select ?? "*");

  if (options?.order) {
    params.set("order", options.order);
  }

  if (options?.filters?.length) {
    applyFilters(params, options.filters);
  }

  const response = await fetch(buildUrl(table, params), {
    method: "GET",
    headers: await getHeaders(),
  });

  return parseResponse<T[]>(response);
}

export async function insertRow<T>(
  table: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const params = new URLSearchParams();
  params.set("select", "*");

  const response = await fetch(buildUrl(table, params), {
    method: "POST",
    headers: await getHeaders("return=representation"),
    body: JSON.stringify(payload),
  });

  const rows = await parseResponse<T[]>(response);
  if (!rows.length) {
    throw new Error(`Data API insert returned no rows for ${table}`);
  }

  return rows[0];
}

export async function updateRows<T>(
  table: string,
  patch: Record<string, unknown>,
  options?: {
    filters?: Filter[];
    orExpression?: string;
    select?: string;
  },
): Promise<T[]> {
  const params = new URLSearchParams();
  params.set("select", options?.select ?? "*");

  if (options?.filters?.length) {
    applyFilters(params, options.filters);
  }

  if (options?.orExpression) {
    params.set("or", options.orExpression);
  }

  const response = await fetch(buildUrl(table, params), {
    method: "PATCH",
    headers: await getHeaders("return=representation"),
    body: JSON.stringify(patch),
  });

  return parseResponse<T[]>(response);
}

export async function updateSingleRow<T>(
  table: string,
  patch: Record<string, unknown>,
  filters: Filter[],
): Promise<T> {
  const rows = await updateRows<T>(table, patch, { filters, select: "*" });
  if (!rows.length) {
    throw new Error(`Data API update returned no rows for ${table}`);
  }

  return rows[0];
}

export async function deleteRows<T>(
  table: string,
  options?: {
    filters?: Filter[];
    orExpression?: string;
    select?: string;
  },
): Promise<T[]> {
  const params = new URLSearchParams();
  params.set("select", options?.select ?? "*");

  if (options?.filters?.length) {
    applyFilters(params, options.filters);
  }

  if (options?.orExpression) {
    params.set("or", options.orExpression);
  }

  const response = await fetch(buildUrl(table, params), {
    method: "DELETE",
    headers: await getHeaders("return=representation"),
  });

  return parseResponse<T[]>(response);
}

export async function deleteSingleRow<T>(
  table: string,
  filters: Filter[],
): Promise<T> {
  const rows = await deleteRows<T>(table, { filters, select: "*" });
  if (!rows.length) {
    throw new Error(`Data API delete returned no rows for ${table}`);
  }

  return rows[0];
}
