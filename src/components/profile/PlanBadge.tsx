import { activePlan, planLabel, type Subscription } from '@/lib/subscription';
import { cn } from '@/lib/utils/cn';

/**
 * The visible half of a subscription.
 *
 * Renders nothing without an active plan, so it can be dropped anywhere a
 * profile is shown without a surrounding conditional.
 *
 * Deliberately a label, not an advantage: it says who supports the project, and
 * changes nothing about a score or a ranking.
 */
export function PlanBadge({
  subscription,
  className,
}: {
  subscription: Subscription | null | undefined;
  className?: string;
}) {
  const plan = activePlan(subscription);
  if (!plan) return null;

  return (
    <span
      title={`Abonné ${planLabel(plan)}`}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-widest',
        plan === 'premium'
          ? 'bg-volt-500/15 text-volt-500'
          : 'bg-gold/15 text-gold',
        className,
      )}
    >
      {planLabel(plan)}
    </span>
  );
}
