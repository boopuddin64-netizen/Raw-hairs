/**
 * Order status workflow, shared by the dashboard's inline orders table and the
 * full orders console. Keep this in one place so the two screens cannot drift,
 * and keep it aligned with the transitions the database trigger accepts.
 */
export const ORDER_TRANSITIONS = {
  awaiting_payment: ['cancelled'],
  pending_admin_approval: ['processing', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['dispatched'],
};

/** The current status plus every status the workflow allows next. */
export const orderStatusOptions = (status) => [...new Set([status, ...(ORDER_TRANSITIONS[status] || [])])];
