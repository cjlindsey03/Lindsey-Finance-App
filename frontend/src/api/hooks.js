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

// monthlyExtra: pass a number to override the active Spending Plan's g1Extra
// for this call only; omit (undefined) to let the backend default from the plan.
export function useG1(monthlyExtra, strategy = 'snowball') {
  const api = useApi();
  const params = new URLSearchParams({ strategy });
  if (monthlyExtra != null) params.set('monthlyExtra', monthlyExtra);
  return useQuery({
    queryKey: ['g1', monthlyExtra, strategy],
    queryFn: () => api(`/g1?${params.toString()}`),
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

export function useSaveSpendingPlan() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, ...plan }) =>
      planId
        ? api(`/spending-plans/${planId}`, { method: 'PUT', body: plan })
        : api('/spending-plans', { method: 'POST', body: plan }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['spending-plans'] }),
  });
}

export function useDeleteSpendingPlan() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId) => api(`/spending-plans/${planId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['spending-plans'] }),
  });
}

// Committing applies the plan's payments to real account balances, so every
// balance-derived view (accounts, G1, G2, G3) has to be refetched after.
export function useCommitSpendingPlan() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, accountPayments, savingsAmount }) =>
      api(`/spending-plans/${planId}/commit`, { method: 'POST', body: { accountPayments, savingsAmount } }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useCreateAccount() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (account) => api('/accounts', { method: 'POST', body: account }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });
}

export function useDeleteAccount() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId) => api(`/accounts/${accountId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['g1'] });
    },
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

export function useRecurringBills() {
  const api = useApi();
  return useQuery({ queryKey: ['recurring-bills'], queryFn: () => api('/recurring-bills') });
}

export function useSaveRecurringBill() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ billId, ...bill }) =>
      billId
        ? api(`/recurring-bills/${billId}`, { method: 'PUT', body: bill })
        : api('/recurring-bills', { method: 'POST', body: bill }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-bills'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}

export function useDeleteRecurringBill() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (billId) => api(`/recurring-bills/${billId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-bills'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}

