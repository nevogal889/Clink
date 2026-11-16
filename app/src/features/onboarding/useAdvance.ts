import type { OnboardingStep } from '@/lib/api';
import { useData } from '@/lib/store';
import { useRouter } from 'expo-router';

import { nextStep, routeFor } from './steps';

/** Saves progress, then moves to the next step. State is saved per step (PRD 3.2 rule 7). */
export function useAdvance(step: Exclude<OnboardingStep, 'done'>) {
  const router = useRouter();
  const { actions } = useData();
  return async () => {
    const next = nextStep(step);
    await actions.setStep(next);
    if (next === 'done') router.replace('/camera');
    else router.push(routeFor(next));
  };
}
