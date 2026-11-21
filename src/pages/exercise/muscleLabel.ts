import { t, type StringKey } from '../../i18n';
import { en } from '../../i18n/en';
import { nice } from './exerciseModel';

/** UI name of a muscle id; falls back to a tidied id when no string exists. */
export const muscleLabel = (id: string): string => (`muscle.${id}` in en ? t(`muscle.${id}` as StringKey) : nice(id));
