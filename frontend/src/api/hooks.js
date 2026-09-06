import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';
import { useAuth } from '../context/AuthContext.jsx';

function useApi() {
  const { user } = useAuth();
  return (path, options) => apiFetch(path, { ...options, idToken: user?.idToken });
}

export function useAccounts() {
  const api = useApi();
  return useQuery({ queryKey: ['accounts'], queryFn: () => api('/accounts') });
}

export function useAccountHistory(accountId) {
  const api = useApi();
  return useQuery({
    queryKey: ['accounts', accountId, 'history'],
    queryFn: () => api(`/accounts/${accountId}/history`),
    enabled: Boolean(accountId),
  });
}

export function useUpdateAccount() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, ...updates }) =>
      api(`/accounts/${accountId}`, { method: 'PUT', body: updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['g1'] });
    },
  });
}

export function useTransactions(filters = {}) {
  const api = useApi();
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== '' && v != null)
  ).toString();
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api(`/transactions${params ? `?${params}` : ''}`),
  });
}

export function useCategorizeTransaction() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transactionId, category, subcategory }) =>
      api(`/transactions/${transactionId}/categorize`, {
        method: 'POST',
        body: { category, subcategory },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });
}

export function useCategoryRules() {
  const api = useApi();
  return useQuery({ queryKey: ['category-rules'], queryFn: () => api('/category-rules') });
}

export function useSaveCategoryRule() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, ...rule }) =>
      ruleId
        ? api(`/category-rules/${ruleId}`, { method: 'PUT', body: rule })
        : api('/category-rules', { method: 'POST', body: rule }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['category-rules'] }),
  });
}

export function useDeleteCategoryRule() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId) => api(`/category-rules/${ruleId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['category-rules'] }),
  });
}

export function useTestCategoryRule() {
  const api = useApi();
  return useMutation({
    mutationFn: (rule) => api('/category-rules/test', { method: 'POST', body: rule }),
  });
}

export function useCashflow(year, month) {
  const api = useApi();
  return useQuery({
    queryKey: ['cashflow', year, month],
    queryFn: () => api(`/cashflow/${year}/${month}`),
  });
}

export function useCreateCashflowEvent() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (event) => api('/cashflow/events', { method: 'POST', body: event }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cashflow'] }),
  });
}

export function useDeleteCashflowEvent() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId) => api(`/cashflow/events/${eventId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cashflow'] }),
  });
}

export function useG1(monthlyExtra = 0, strategy = 'snowball') {
  const api = useApi();
  return useQuery({
    queryKey: ['g1', monthlyExtra, strategy],
    queryFn: () => api(`/g1?monthlyExtra=${monthlyExtra}&strategy=${strategy}`),
  });
}

export function useReorderG1() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order) => api('/g1/order', { method: 'PUT', body: order }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['g1'] }),
  });
}

export function useG2() {
  const api = useApi();
  return useQuery({ queryKey: ['g2'], queryFn: () => api('/g2') });
}

export function useUpdateG2() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => api('/g2', { method: 'PUT', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['g2'] }),
  });
}

export function useG3() {
  const api = useApi();
  return useQuery({ queryKey: ['g3'], queryFn: () => api('/g3') });
}

export function useLogScore() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => api('/g3', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['g3'] }),
  });
}

export function useSpendingPlans() {
  const api = useApi();
  return useQuery({ queryKey: ['spending-plans'], queryFn: () => api('/spending-plans') });
}

export function useSpendingPlan(payDate) {
  const api = useApi();
  return useQuery({
    queryKey: ['spending-plans', payDate],
    queryFn: () => api(`/spending-plans/${payDate}`),
    enabled: Boolean(payDate),
  });
}

export function useSaveSpendingPlan() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan) => api('/spending-plans', { method: 'POST', body: plan }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['spending-plans'] }),
  });
}

export function usePcsSimulations() {
  const api = useApi();
  return useQuery({ queryKey: ['pcs-simulator'], queryFn: () => api('/pcs-simulator') });
}

export function useRunPcsSimulation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => api('/pcs-simulator', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pcs-simulator'] }),
  });
}

export function useTasks() {
  const api = useApi();
  return useQuery({ queryKey: ['tasks'], queryFn: () => api('/tasks') });
}

export function useSaveTask() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...task }) =>
      taskId ? api(`/tasks/${taskId}`, { method: 'PUT', body: task }) : api('/tasks', { method: 'POST', body: task }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useRentals(filters = {}) {
  const api = useApi();
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== '' && v != null)
  ).toString();
  return useQuery({
    queryKey: ['rentals', filters],
    queryFn: () => api(`/rentals${params ? `?${params}` : ''}`),
    enabled: false,
  });
}

export function usePlaidLinkToken() {
  const api = useApi();
  return useMutation({ mutationFn: () => api('/plaid/link-token', { method: 'POST' }) });
}

export function useSyncPlaid() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/plaid/sync', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useExchangePlaidToken() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ publicToken, institutionId, institutionName }) =>
      api('/plaid/exchange-token', {
        method: 'POST',
        body: { publicToken, institutionId, institutionName },
      }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
