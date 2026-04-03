import { throwUncompiledError } from './errors.js';
import type { EffectDecorator, RefDecorator, StateDecorator, UseDecoratorFactory } from './types.js';

export const state: StateDecorator = function state(_value, _context) {
  throwUncompiledError();
};

export const ref: RefDecorator = function ref(_value, _context) {
  throwUncompiledError();
};

const effectBase: EffectDecorator['layout'] = function effect(_value, _context) {
  throwUncompiledError();
};

const layoutEffect: EffectDecorator['layout'] = function layout(_value, _context) {
  throwUncompiledError();
};

export const effect: EffectDecorator = Object.assign(effectBase, {
  layout: layoutEffect,
}) as EffectDecorator;

export const use: UseDecoratorFactory = function use(_primitive, _argsFactory) {
  return function useField(_value, _context) {
    throwUncompiledError();
  };
};
