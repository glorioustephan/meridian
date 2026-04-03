import type React from 'react';

export abstract class Component<Props = {}> {
  declare readonly props: Readonly<Props>;
  abstract render(): React.ReactNode;
}

export abstract class Primitive<T> {
  abstract resolve(): T;
}

export interface StateDecorator {
  (value: undefined, context: ClassFieldDecoratorContext): void;
}

export interface RefDecorator {
  (value: undefined, context: ClassFieldDecoratorContext): void;
}

export interface EffectDecorator {
  (value: Function, context: ClassMethodDecoratorContext): void;
  layout: (value: Function, context: ClassMethodDecoratorContext) => void;
}

export interface UseDecoratorFactory {
  <TArgs extends unknown[]>(
    primitive: new (...args: TArgs) => Primitive<unknown>,
    argsFactory: () => TArgs,
  ): StateDecorator;
}
