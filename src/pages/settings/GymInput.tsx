import { useId } from 'preact/hooks';
import type { JSX } from 'preact';
import { Field } from '../../ui/components';

/** A labelled text or password box for the gym screens (the shared Input takes no type or value). */
export function GymInput({ label, ...rest }: { label: string } & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class' | 'className' | 'label'>) {
  const id = useId();
  return (
    <Field id={id} label={label}>
      <input {...rest} id={id} class="sf-input" />
    </Field>
  );
}
