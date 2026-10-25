import type { ComponentPropsWithRef, CSSProperties } from 'react';
import { Field, type FieldProps } from './Field';

export type TextAreaProps = FieldProps & Omit<ComponentPropsWithRef<'textarea'>,
  keyof FieldProps | 'value' | 'defaultValue' | 'onChange' | 'children'> & {
  value: string;
  onValueChange: (value: string) => void;
  height?: CSSProperties['height'];
};

export function TextArea({ id, label, required, invalid, error, hint, wide, value, onValueChange, height = 96, className, style, rows = 3, ...textarea }: TextAreaProps) {
  return <Field {...{ id, label, required, invalid, error, hint, wide }}>{binding =>
    <textarea {...textarea} {...binding} className={`base-control base-textarea ${className ?? ''}`} required={required} rows={rows} value={value} style={{ ...style, height, resize: 'none', overflowY: 'auto' }} onChange={event => onValueChange(event.currentTarget.value)} />
  }</Field>;
}
