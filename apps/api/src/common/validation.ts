import { ValidationError, ValidationPipe } from "@nestjs/common";
import { AppError, type FieldIssue } from "./app-error";

function flatten(errors: ValidationError[], prefix = ""): FieldIssue[] {
  return errors.flatMap((e) => {
    const field = prefix ? `${prefix}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/** Strict global validation: unknown properties are rejected, not silently ignored. */
const GENERIC_TYPE_MESSAGE =
  /must be (a|an) (string|number|boolean|uuid)|must be a number conforming|must be a valid/i;

/** One clear message per field: drop duplicates and generic type errors when a friendlier message exists. */
function tidy(issues: FieldIssue[]): FieldIssue[] {
  const byField = new Map<string, FieldIssue[]>();
  for (const i of issues) byField.set(i.field, [...(byField.get(i.field) ?? []), i]);
  return [...byField.values()].map((list) => {
    const friendly = list.filter((i) => !GENERIC_TYPE_MESSAGE.test(i.message));
    return (friendly.length ? friendly : list)[0] as FieldIssue;
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => {
      const details = tidy(flatten(errors));
      return AppError.badRequest(
        "VALIDATION_FAILED",
        details[0]?.message ?? "Some fields need your attention.",
        details
      );
    }
  });
}
