// Onboarding order (PRD 3.2). Step 1 is sign-in; these are steps 2 to 6.
import { ONBOARDING_STEPS, type OnboardingStep } from '@/lib/api';

export type StepRoute =
  | '/onboarding/name'
  | '/onboarding/usual'
  | '/onboarding/invite'
  | '/onboarding/notifications'
  | '/onboarding/widget'
  | '/camera';

export function routeFor(step: OnboardingStep): StepRoute {
  return step === 'done' ? '/camera' : (`/onboarding/${step}` as StepRoute);
}

/** 1-based number shown in "{n} of 6": sign-in is 1, name is 2. */
export function stepNumber(step: Exclude<OnboardingStep, 'done'>): number {
  return ONBOARDING_STEPS.indexOf(step) + 2;
}

export function nextStep(step: Exclude<OnboardingStep, 'done'>): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[i + 1] ?? 'done';
}
