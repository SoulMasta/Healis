import { useReducer, useCallback, useRef } from 'react';
import { getElementsByDesk } from '../http/elementsAPI';

function idKey(raw) {
  return raw == null ? null : String(raw);
}

function sameId(a, b) {
  const ka = idKey(a);
  const kb = idKey(b);
  return ka != null && kb != null && ka === kb;
}

function normalizeElementId(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

function upsertById(list, item) {
  if (!Array.isArray(list)) return Array.isArray(item) ? item : [];
  if (!item || item.id == null) return list;
  const idx = list.findIndex((x) => sameId(x?.id, item.id));
  if (idx < 0) return [...list, item];
  const next = list.slice();
  next[idx] = { ...next[idx], ...item };
  return next;
}

function dedupeMergeById(list) {
  if (!Array.isArray(list) || list.length <= 1) return list;
  const indexById = new Map();
  const out = [];
  let changed = false;
  for (const el of list) {
    const k = idKey(el?.id);
    if (!k) {
      out.push(el);
      continue;
    }
    const idx = indexById.get(k);
    if (idx == null) {
      indexById.set(k, out.length);
      out.push(el);
      continue;
    }
    changed = true;
    out[idx] = { ...out[idx], ...el };
  }
  return changed ? out : list;
}

const SET_ELEMENTS = 'SET_ELEMENTS';
const UPSERT_ELEMENT = 'UPSERT_ELEMENT';
const UPDATE_ELEMENT = 'UPDATE_ELEMENT';
const REMOVE_ELEMENT = 'REMOVE_ELEMENT';
const MAP_ELEMENTS = 'MAP_ELEMENTS';
const SET_EDITING = 'SET_EDITING';
const DEDUPE = 'DEDUPE';

function elementsReducer(state, action) {
  switch (action.type) {
    case SET_ELEMENTS:
      return dedupeMergeById(Array.isArray(action.payload) ? action.payload : []);
    case UPSERT_ELEMENT:
      return upsertById(state, action.payload);
    case UPDATE_ELEMENT: {
      const { elementId, patch } = action.payload;
      return state.map((el) => (sameId(el?.id, elementId) ? { ...el, ...patch } : el));
    }
    case REMOVE_ELEMENT:
      return state.filter((x) => !sameId(x?.id, action.payload));
    case MAP_ELEMENTS: {
      if (typeof action.payload !== 'function') return state;
      const next = action.payload(state);
      return Array.isArray(next) ? next.filter((el) => el != null) : state;
    }
    case DEDUPE: {
      const seen = new Set();
      for (const el of state) {
        const k = idKey(el?.id);
        if (!k) continue;
        if (seen.has(k)) return dedupeMergeById(state);
        seen.add(k);
      }
      return state;
    }
    default:
      return state;
  }
}

function workspaceReducer(state, action) {
  if (action.type === SET_EDITING) {
    return { ...state, editingElementId: action.payload };
  }
  return { ...state, elements: elementsReducer(state.elements, action) };
}

const initialState = { elements: [], editingElementId: null };

export function useWorkspace() {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const { elements, editingElementId } = state;

  const load = useCallback((deskId, elementToVm, opts = {}) => {
    const isMounted = opts.isMounted ?? (() => true);
    if (!deskId) return Promise.resolve();
    return getElementsByDesk(deskId)
      .then((data) => {
        if (!isMounted()) return;
        const mapped = Array.isArray(data) ? data.map((el) => (elementToVm ? elementToVm(el) : el)) : [];
        dispatch({ type: SET_ELEMENTS, payload: mapped });
      })
      .catch(() => {
        if (isMounted()) dispatch({ type: SET_ELEMENTS, payload: [] });
      });
  }, []);

  const add = useCallback((vm) => {
    if (vm?.id) dispatch({ type: UPSERT_ELEMENT, payload: vm });
  }, []);

  const update = useCallback((elementId, patch) => {
    dispatch({ type: UPDATE_ELEMENT, payload: { elementId, patch } });
  }, []);

  const remove = useCallback((elementId) => {
    dispatch({ type: REMOVE_ELEMENT, payload: elementId });
  }, []);

  const mapElements = useCallback((fn) => {
    dispatch({ type: MAP_ELEMENTS, payload: fn });
  }, []);

  const editingRef = useRef(editingElementId);
  editingRef.current = editingElementId;
  const setEditingElementId = useCallback((value) => {
    const next = typeof value === 'function' ? value(editingRef.current) : value;
    dispatch({ type: SET_EDITING, payload: next });
  }, []);

  const dedupe = useCallback(() => {
    dispatch({ type: DEDUPE });
  }, []);

  const setElements = useCallback((fnOrArray) => {
    if (typeof fnOrArray === 'function') {
      dispatch({ type: MAP_ELEMENTS, payload: fnOrArray });
    } else {
      dispatch({ type: SET_ELEMENTS, payload: fnOrArray });
    }
  }, []);

  return {
    elements,
    editingElementId,
    setEditingElementId,
    load,
    add,
    update,
    remove,
    mapElements,
    setElements,
    dedupe,
  };
}

export { idKey, sameId, upsertById, dedupeMergeById, normalizeElementId };
