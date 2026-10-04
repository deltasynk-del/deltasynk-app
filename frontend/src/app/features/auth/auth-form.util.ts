import { FormControl, FormGroupDirective, NgForm } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';

/** Show field errors after blur or submit — not on first load. */
export class AuthFormErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(
    control: FormControl | null,
    form: FormGroupDirective | NgForm | null,
  ): boolean {
    const submitted = form?.submitted ?? false;
    const touched = control?.touched ?? false;
    return !!(control?.invalid && (touched || submitted));
  }
}

export const PASSWORD_HINT =
  'Use 8+ characters with upper, lower, number, and special character.';
