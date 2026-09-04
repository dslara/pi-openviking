export class Uri {
  constructor(readonly value: string) {
    if (!value) throw new Error("Uri cannot be empty");
    if (!value.startsWith("viking://")) {
      throw new Error(`Invalid URI: "${value}" — must start with viking://`);
    }
    if (/^viking:\/\/user\/(resources|memories|skills)(\/|$)/.test(value)) {
      const suggestion = value.replace(/^viking:\/\/user\//, "viking://~/");
      throw new Error(
        `Deprecated URI "${value}" — uid-less viking://user/ was removed in OV v0.4.17. Use "${suggestion}" or "viking://user/{user_id}/..."`,
      );
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: Uri): boolean {
    return this.value === other.value;
  }
}
