import _ from 'lodash';
import { parseExpressionAt } from 'acorn';
import { simple as walk } from 'acorn-walk';

const removeAttr = (element, name) => {
    const attrNode = element.getAttributeNode(name);
    if (attrNode) {
        element.removeAttributeNode(attrNode);
        return attrNode.nodeValue;
    }
};
const findValueInContexts = (name, contexts, callback) => {
    for (let i = contexts.length - 1; i >= 0; i--) {
        const context = contexts[i];
        if (name in context) {
            callback(context[name]);
            return;
        }
    }
};
const parseAst = (expression) => {
    try {
        return parseExpressionAt(expression, 0, { ecmaVersion: 'latest' });
    } catch (e) {
        throw new SyntaxError(`${e.message}\n表达式：\n${expression}\n`);
    }
};
const renderValueInContexts = (expression, contexts = []) => {
    const variableNames = new Set();
    walk(parseAst(expression), {
        Identifier(node) {
            variableNames.add(node.name);
        },
    });

    let thisObj;
    const paramNames = [];
    const paramValues = [];
    findValueInContexts('this', contexts, (value) => {
        thisObj = value;
    });
    variableNames.forEach(variableName => {
        findValueInContexts(variableName, contexts, (value) => {
            paramNames.push(variableName);
            paramValues.push(value);
        });
    });

    const renderFunction = new Function(paramNames, `
        'use strict';
		return ${expression};
	`);
    return renderFunction.apply(thisObj, paramValues);
};
const nodesToDocumentFragment = (nodes) => {
    return Array.from(nodes).reduce((fragment, node) => {
        fragment.appendChild(node);
        return fragment;
    }, document.createDocumentFragment());
};
const insertNodeBefore = (nodeToInsert, node) => {
    node.parentNode.insertBefore(nodeToInsert, node);
};
const insertNodeAfter = (nodeToInsert, node) => {
    node.nextSibling ? insertNodeBefore(nodeToInsert, node.nextSibling) : node.parentNode ? node.parentNode.appendChild(nodeToInsert) : void 0;
};
const cloneNode = (node, deep) => {
    const clonedNode = node.cloneNode(deep);
    node._wiyComponent && (clonedNode._wiyComponent = node._wiyComponent);
    node._wiySlots && (clonedNode._wiySlots = node._wiySlots);
    return clonedNode;
};
const loadComponentDefine = async (component) => {
    if (_.isFunction(component)) {//如果component是一个函数，则执行这个函数，得到返回结果
        component = component();
    }
    //component应该是一个组件的定义对象，或者一个import()语句返回的Promise，Promise返回的是一个Module，里面的default应该是Module导出的默认内容，应该是一个组件的定义对象
    if (component instanceof Promise) {
        component = (await component).default;
    }
    if (!component._uuid) {
        component._uuid = _.uniqueId('component-define-');
    }
    return _.cloneDeep(component);//将组件定义进行深拷贝，使组件间数据隔离
};
const loadSourceString = async (source) => {
    //source应该是一个字符串，或者一个import()语句返回的Promise，Promise返回的是一个Module，里面的default应该是Module导出的默认内容，应该是一个字符串
    return source instanceof Promise ? (await source).default : source;
};
const loadPluginDefine = async (plugin) => {
    //plugin应该是一个插件的定义对象，或者一个import()语句返回的Promise，Promise返回的是一个Module，里面的default应该是Module导出的默认内容，应该是一个插件的定义对象
    return plugin instanceof Promise ? (await plugin).default : plugin;
};




class Queue {
    constructor() {
        Object.defineProperties(this, {
            _items: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: [],
            },
            _set: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: new Set(),
            },
        });
    }

    enqueue(item) {
        const items = this._items;
        const set = this._set;
        const observer = item.observer;
        if (set.has(observer)) {
            items.splice(_.findIndex(items, i => {
                return i.observer === observer;
            }), 1);
            items.push(item);
        }
        items.push(item);
        set.add(observer);
    }

    dequeue() {
        const item = this._items.shift();
        this._set.delete(item.observer);
        return item;
    }

    size() {
        return this._items.length;
    }

    isEmpty() {
        return this.size() === 0;
    }
}
class Stack {
    constructor() {
        Object.defineProperties(this, {
            _items: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: [],
            },
        });
    }

    push(element) {
        this._items.push(element);
    }

    pop() {
        return this._items.pop();
    }

    size() {
        return this._items.length;
    }

    isEmpty() {
        return this.size() === 0;
    }

    forEach(callback) {
        this._items.forEach(callback);
    }
}
class ObserverManager {
    constructor() {
        Object.defineProperties(this, {
            _map: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: new Map(),//需要注意内存泄漏
            },
            _queue: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: new Queue(),
            },
            _stack: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: new Stack(),
            },
            _symbolForTargetSelf: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: Symbol(),
            },
        });

        const update = async () => {
            while (!this._queue.isEmpty()) {
                if (!this._stack.isEmpty()) {
                    break;
                }
                const { observer, notifier } = this._queue.dequeue();
                if (!observer.isActive()) {
                    continue;
                }
                observer._status = 'pause';
                try {
                    await observer.process(notifier);
                } catch (e) {
                    console.error(e, observer, notifier);
                }
            }
            setTimeout(update, 0);
        };
        setTimeout(update, 0);

        const clear = () => {
            for (const [target, temp] of this._map) {
                for (const [prop, observers] of temp) {
                    for (const observer of observers) {
                        observer.needDestroy() && observers.delete(observer);
                    }
                    observers.size === 0 && temp.delete(prop);
                }
                temp.size === 0 && this._map.delete(target);
            }
            window.requestIdleCallback(clear);
        };
        window.requestIdleCallback(clear);
    }

    push(observer) {
        observer._status = 'active';
        this._stack.push(observer);
    }

    pop() {
        this._stack.pop();
    }

    /**
     * @param {*} target 
     * @param {*} prop  当观察者观察的是target本身，而不是target下的具体某个属性时，不需要传prop
     */
    observe(target, prop = this._symbolForTargetSelf) {
        if (this._stack.isEmpty()) {
            return;
        }
        const temp = this._map.get(target) || new Map();//需要注意内存泄漏
        this._map.set(target, temp);
        const observers = temp.get(prop) || new Set();//需要注意内存泄漏
        temp.set(prop, observers);
        this._stack.forEach(observer => {
            observers.add(observer);
        });
    }

    notify(target, prop, propsChanged) {
        const temp = this._map.get(target);
        if (!temp) {
            return;
        }
        const observers = new Set();
        //该属性的观察者
        temp.get(prop)?.forEach(observer => {
            observers.add(observer);
        });
        //该属性所属对象本身的观察者
        propsChanged && temp.get(this._symbolForTargetSelf)?.forEach(observer => {
            observers.add(observer);
        });

        //添加到处理队列中
        Array.from(observers).sort((a, b) => {
            return a._uuid - b._uuid;
        }).forEach(observer => {
            this._queue.enqueue({
                observer,
                notifier: {
                    target,
                    prop,
                    propsChanged,
                },
            });
        });
    }
}
class Observer {
    constructor(config) {
        Object.defineProperties(this, {
            _uuid: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: parseInt(_.uniqueId()),
            },
            _callback: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: config.callback,
            },
            _info: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: config.info,
            },
            _component: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: config.component._rawThis,
            },
            _destroyWithNode: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: config.destroyWithNode,
            },
            _status: {
                writable: true,
                configurable: false,
                enumerable: false,
                value: 'active',
            },
        });
    }

    async process(notifier) {
        await this._callback(notifier);
    }

    needDestroy() {
        return this._status === 'destroy' || this._destroyWithNode?._wiyObserverStatus === 'destroy' || this._component?._observerStatus === 'destroy';
    }

    isActive() {
        return this._status === 'active' && this._destroyWithNode?._wiyObserverStatus !== 'destroy' && this._component?._observerStatus === 'active';
    }
}
const ownPropChangeable = (target, prop) => {
    const propDesc = Reflect.getOwnPropertyDescriptor(target, prop);
    return !propDesc || propDesc.writable || propDesc.configurable;
};
const ownPropWritable = (target, prop) => {
    const propDesc = Reflect.getOwnPropertyDescriptor(target, prop);
    return !propDesc || propDesc.writable;
};
const propIgnored = (target, prop) => {
    if (proxyIgnoreProperties.has(prop)) {
        return true;
    }
    const proxyIgnoreProps = target._proxyIgnoreProps;
    return proxyIgnoreProps?.has(prop);
};
const proxyIgnoreProperties = new Set(['this', '_proxyUuid', '_rawThis', '_proxyThis', '_proxyIgnoreProps']);
const tryCreateProxy = (obj) => {
    if (obj?._proxyUuid) {
        return obj;
    }
    if (!_.isObject(obj) || obj instanceof Date || obj instanceof Node || obj instanceof Function || obj instanceof Promise) {
        return obj;
    }
    const proxyObj = new Proxy(obj, {
        has(target, prop) {
            const has = Reflect.has(target, prop);
            if (!propIgnored(target, prop)) {
                if (!has || ownPropChangeable(target, prop)) {
                    OBSERVER_MANAGER.observe(target, prop);
                }
            }
            return has;
        },
        get(target, prop) {
            let value = Reflect.get(target, prop);
            if (!propIgnored(target, prop)) {
                if (ownPropChangeable(target, prop)) {
                    const newValue = tryCreateProxy(value);
                    if (newValue !== value) {
                        Reflect.set(target, prop, value = newValue);
                    }
                    OBSERVER_MANAGER.observe(target, prop);
                }
            }
            return value;
        },
        ownKeys(target) {
            const result = Reflect.ownKeys(target);
            OBSERVER_MANAGER.observe(target);
            return result;
        },
        set(target, prop, value) {//如果加了receiver，就会和defineProperty重复触发
            if (!propIgnored(target, prop)) {
                const has = Reflect.has(target, prop);
                if (!has || ownPropWritable(target, prop)) {
                    value = tryCreateProxy(value);
                    if (!has
                        || (Array.isArray(target) && prop === 'length')
                        || value !== Reflect.get(target, prop)) {
                        OBSERVER_MANAGER.notify(target, prop, !has);
                    }
                }
            }
            const result = Reflect.set(target, prop, value);
            return result;
        },
        deleteProperty(target, prop) {
            const result = Reflect.deleteProperty(target, prop);
            if (!propIgnored(target, prop)) {
                if (result) {
                    OBSERVER_MANAGER.notify(target, prop, true);
                }
            }
            return result;
        },
        defineProperty(target, prop, attributes) {
            const result = Reflect.defineProperty(target, prop, attributes);
            if (!propIgnored(target, prop)) {
                if (result) {
                    OBSERVER_MANAGER.notify(target, prop, true);
                }
            }
            return result;
        },
    });
    Object.defineProperties(obj, {
        _proxyUuid: {
            writable: false,
            configurable: false,
            enumerable: false,
            value: parseInt(_.uniqueId()),
        },
        _rawThis: {
            writable: false,
            configurable: false,
            enumerable: false,
            value: obj,
        },
        _proxyThis: {
            writable: false,
            configurable: false,
            enumerable: false,
            value: proxyObj,
        },
    });
    return proxyObj;
};
const OBSERVER_MANAGER = new ObserverManager();



const collectToDestroyNodes = (obj, toDestroyNodes) => {
    if (obj instanceof Node) {
        switch (obj.nodeType) {
            case Node.DOCUMENT_FRAGMENT_NODE:
            case Node.ELEMENT_NODE:
                for (const childNode of Array.from(obj.childNodes)) {
                    collectToDestroyNodes(childNode, toDestroyNodes);
                }
                break;
        }
        toDestroyNodes.add(obj);
    } else {
        const nodeList = toNodeList(obj);
        for (const node of nodeList) {
            collectToDestroyNodes(node, toDestroyNodes);
        }
    }
};
const destroy = async (obj) => {
    const toDestroyNodes = new Set();
    collectToDestroyNodes(obj, toDestroyNodes);

    for (const node of toDestroyNodes) {
        node._wiyObserverStatus = 'destroy';//终止观察
        await node._wiyComponent?.destroy();
    }
};
const replaceWith = async (node, obj, needDestroy = true) => {
    needDestroy && await destroy(node);
    if (obj instanceof Node) {
        node.replaceWith(obj);
    } else {
        node.replaceWith(nodesToDocumentFragment(toNodeList(obj)));
    }
};
const insertAfter = async (node, obj) => {
    const temp = document.createTextNode('');
    insertNodeAfter(temp, node);
    await replaceWith(temp, obj);
};
const remove = async (obj, needDestroy = true) => {
    needDestroy && await destroy(obj);
    if (obj instanceof Node) {
        obj.remove();
    } else {
        nodesToDocumentFragment(toNodeList(obj));
    }
};
const toNodeList = (obj) => {
    if (obj instanceof Node) {
        return [obj];
    } else {
        const list = [];
        for (const item of obj) {
            if (_.isNil(item)) {
                continue;
            }
            for (const node of toNodeList(item)) {
                list.push(node);
            }
        }
        return list;
    }
}




const wiyEnv = {
    get publicPath() {
        try {
            return process.env.WIY.PUBLIC_PATH;
        } catch {
            return '/';
        }
    }
};










class Component extends EventTarget {
    constructor(config = {}) {
        super();
        Object.defineProperties(this, {
            _uuid: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: parseInt(_.uniqueId()),
            },
            _config: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: config,
            },
            _element: {
                writable: true,
                configurable: false,
                enumerable: false,
            },
            _parent: {
                writable: true,
                configurable: false,
                enumerable: false,
            },
            _children: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: new Set(),//需要注意内存泄漏
            },
            _oldElement: {
                writable: true,
                configurable: false,
                enumerable: false,
            },
            _oldParent: {
                writable: true,
                configurable: false,
                enumerable: false,
            },
            _oldChildren: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: new Set(),//需要注意内存泄漏
            },
            _observerStatus: {
                writable: true,
                configurable: false,
                enumerable: false,
                value: 'active',
            },
        });

        const proxy = tryCreateProxy(this);
        proxy.init();
        return proxy;
    }

    async executeLifecycle(name, data) {
        const lifecycleFunction = (this._config.lifecycle || {})[name];
        lifecycleFunction && await lifecycleFunction.bind(this._proxyThis)(data);
        this.trigger(name.toLowerCase(), data);
    }

    async init() {
        await this.executeLifecycle('beforeInit');
        this._config.components = this._config.components || {};

        Object.entries(this._config.components).forEach(([name, value]) => {
            this._config.components[_.kebabCase(name)] = value;
        });
        Object.entries(this._config.methods || {}).forEach(([name, value]) => {
            Object.defineProperty(this, name, {
                writable: false,
                configurable: false,
                enumerable: false,
                value: value.bind(this._proxyThis),
            });
        });
        Object.entries(this._config.listeners || {}).forEach(([name, value]) => {
            value.forEach(listener => {
                this.on(name, listener);
            });
        });
        let data = this._config.data;
        if (_.isFunction(data)) {
            data = data.bind(this._proxyThis)();
        }
        Object.entries(data || {}).forEach(([name, value]) => {
            this[name] = value;
        });
        for (const dataBinder of (this._config.dataBinders || [])) {
            await dataBinder(this._proxyThis);
        }
        await this.executeLifecycle('init');
    }

    getUuid() {
        return this._uuid;
    }

    getApp() {
        return this._config.app;
    }

    setData(data) {
        Object.entries(data || {}).forEach(([name, value]) => {
            this._proxyThis[name] = value;
        });
    }

    attr(name) {
        return this._element?.getAttribute(name);
    }

    hasAttr(name) {
        return this._element?.hasAttribute(name);
    }

    hasSlotTemplate(name = '') {
        return !!this._config.slots[name]?.assigned;
    }

    on(eventType, listener) {
        this._rawThis.addEventListener(eventType, listener);
    }

    off(eventType, listener) {
        this._rawThis.removeEventListener(eventType, listener);
    }

    trigger(eventType, data, cause) {
        this._rawThis.dispatchEvent(new WiyEvent(eventType, data, cause));
    }

    onEventPath(e, element) {
        return e.composedPath().some(node => {
            if (element) {
                return node === element;
            }
            return node === this || node._rawThis === this._rawThis || node === this._element;
        });
    }

    getElement(id) {
        if (!id) {
            return this._element;
        }
        return this._element?.shadowRoot.getElementById(id);
    }

    getComponent(id) {
        return this.getElement(id)?._wiyComponent || [...this._children].find(child => {
            return child._element?.id === id;
        });
    }

    getComponentConfig(name) {
        if (!name) {
            return this._config;
        }
        return this._config.components[_.kebabCase(name)] || this._config.app.getComponentConfig(name);
    }

    getTemplate(id) {
        const element = this.getElement(id);
        if (element?.nodeName === "TEMPLATE") {
            return element.innerHTML;
        }
    }

    getParent() {
        return this._parent;
    }

    addChild(component) {
        const oldParent = component._parent;
        if (oldParent) {
            oldParent.removeChild(component);
        }
        this._children.add(component._proxyThis);
        component._parent = this._proxyThis;
    }

    removeChild(component) {
        if (!this._children.has(component._proxyThis)) {
            throw new Error(`${component._uuid}不是${this._uuid}的子组件`);
        }
        this._children.delete(component._proxyThis);
        component._parent = null;
    }

    raw(obj) {
        return tryCreateProxy(obj)?._rawThis || obj;
    }

    proxy(obj) {
        return tryCreateProxy(obj)?._proxyThis || obj;
    }

    async actual(obj) {
        return await (_.isFunction(this.raw(obj)) ? obj() : obj);
    }

    async mount(element) {
        if (this._element) {
            throw new Error(`${this._uuid}已挂载，无法重复挂载`);
        }
        if (this._oldElement && this._oldElement !== element) {
            throw new Error(`${this._uuid}无法切换挂载`);
        }

        await this.executeLifecycle('beforeMount', {
            element,
        });

        //将element与组件相互关联
        this._element = element;
        this._element._wiyComponent = this._proxyThis;

        if (this._oldElement) {
            this._oldParent?.addChild(this);//将父子组件相互关联
            for (const child of this._oldChildren) {//挂载所有子组件
                await child.mount(child._oldElement);
            }

            this._oldElement = null;
            this._oldParent = null;
            this._oldChildren.clear();

            this._observerStatus = 'active';//继续观察
        } else {
            element.setAttribute('uuid', this._uuid);
            Object.entries(this._config.listeners || {}).forEach(([name, value]) => {
                value.forEach(listener => {
                    element.addEventListener(name, listener);
                });
            });

            const root = element.attachShadow({ mode: 'open' });
            Object.defineProperties(root, {//hack，某些三方库在shadow dom中有问题
                parentNode: {
                    writable: false,
                    configurable: false,
                    enumerable: false,
                    value: element,
                },
                scrollLeft: {
                    writable: false,
                    configurable: false,
                    enumerable: false,
                    value: 0,
                },
                scrollTop: {
                    writable: false,
                    configurable: false,
                    enumerable: false,
                    value: 0,
                },
            });

            root.innerHTML = await loadSourceString(this._config.template) || '';
            const style = document.createElement('style');
            style.innerHTML = await loadSourceString(this._config.style) || '';
            root.prepend(style);

            await this.executeLifecycle('beforeRender');
            await this.renderNodes(root.childNodes);
            await this.executeLifecycle('render');
        }

        await this.executeLifecycle('mount');
    }

    async unmount() {
        await this.executeLifecycle('beforeUnmount');

        this._observerStatus = 'pause';//暂停观察

        this._oldElement = this._element;
        this._oldParent = this._parent;
        for (const child of this._children) {
            await child.unmount();
            this._oldChildren.add(child);
        }

        this._parent?.removeChild(this);//解除父子组件关联

        if (this._element) {
            //解除element与组件关联
            this._element._wiyComponent = null;
            this._element = null;
        }

        await this.executeLifecycle('unmount', {
            element: this._oldElement,
            parent: this._oldParent,
            children: this._oldChildren,
        });
    }

    async destroy() {
        if (this._element) {
            await this.unmount();
        }

        await this.executeLifecycle('beforeDestroy');

        this._observerStatus = 'destroy';//终止观察

        for (const child of this._oldChildren) {
            await child.destroy();
        }

        this._oldElement = null;
        this._oldParent = null;
        this._oldChildren.clear();

        await this.executeLifecycle('destroy');
    }

    async remove() {
        await remove(this._element);
    }

    async observe(func, callback, destroyWithNode, info) {
        let firstObserve = true;
        let oldResult;
        const startObserve = async (notifier) => {
            let result;
            OBSERVER_MANAGER.push(observer);
            try {
                result = func();
            } finally {
                OBSERVER_MANAGER.pop();
            }

            if (result instanceof Promise) {
                result = await result;
            }
            if (!firstObserve && !_.isObject(result) && oldResult === result) {
                return;
            }

            const callbackResult = await callback(result, firstObserve, notifier);
            firstObserve = false;
            oldResult = result;
            return callbackResult;
        };
        const observer = new Observer({
            callback: async (notifier) => {
                await firstObservePromise;
                await startObserve(notifier);
            },
            info,
            component: this,
            destroyWithNode,
        });
        const firstObservePromise = startObserve();
        return await firstObservePromise;
    }

    async renderTextOrAttr(node, extraContexts = []) {
        const originNodeValue = node.nodeValue;
        if (originNodeValue?.includes('{{')) {
            await this.observe(async () => {
                return await this.actual(this.renderString(originNodeValue, extraContexts));
            }, (result) => {
                node.nodeValue = result;
            }, node.ownerElement || node, originNodeValue);
        }
        return node;
    }

    async renderElement(node, extraContexts = []) {
        const attrs = {};
        for (const attrNode of node.attributes) {
            const attrName = attrNode.nodeName;
            if (attrName.startsWith('wiy:let-')) {
                return await this.renderWiyLet(node, extraContexts, attrName.slice(8));
            }
            attrs[attrName] = attrNode;
        }
        if ('wiy:if' in attrs) {
            return await this.renderWiyIf(node, extraContexts);
        }
        if ('wiy:for' in attrs) {
            return await this.renderWiyFor(node, extraContexts);
        }
        if ('wiy:slot' in attrs || 'wiy:slot.data' in attrs) {
            return await this.renderWiySlot(node, extraContexts);
        }

        const getCommandBindAttrName = (command, attrName) => {
            const prefix = `${command}-`;
            if (attrName.startsWith(prefix)) {
                return attrName.slice(prefix.length);
            } else if (attrName !== command) {
                return;
            }

            if (command === 'wiy:data') {
                switch (nodeName) {//部分表单标签在不指定绑定属性时，有默认绑定属性
                    case 'INPUT':
                        switch (node.getAttribute('type')) {
                            case 'checkbox':
                            case 'radio':
                                return 'checked';
                            default:
                                return 'value';
                        }
                    case 'TEXTAREA':
                    case 'SELECT':
                        return 'value';
                }
            }
            return '';
        };
        const toStandardName = (command, name) => {
            switch (command) {
                case 'wiy:attr': return _.kebabCase(name);
                case 'wiy:class': return _.kebabCase(name);
                case 'wiy:style': return _.kebabCase(name);
                case 'wiy:data': return _.camelCase(name);
                case 'wiy:method': return _.camelCase(name);
                default: return name;
            }
        };
        const processCommand = async (command, attrName, attrValue, callback) => {
            const bindAttrName = getCommandBindAttrName(command, attrName);
            if (_.isNil(bindAttrName)) {
                return;
            }

            await this.observe(async () => {
                let value = this.renderValue(attrValue, extraContexts);
                if (command !== 'wiy:method') {
                    value = await this.actual(value);
                }
                return value;
            }, async (result, firstObserve) => {
                if (bindAttrName) {
                    await callback(toStandardName(command, bindAttrName), result, firstObserve);
                } else {
                    if (_.isNil(result)) {
                        return;
                    }
                    await this.observe(() => {
                        return Object.entries(result);
                    }, async (entries, firstObserveOfEntries) => {
                        for (const [key, value] of entries) {
                            await callback(toStandardName(command, key), value, firstObserve && firstObserveOfEntries);
                        }
                    }, node, `Object.entries(${attrValue})`);
                }
            }, node, attrValue);
        };
        const bindData = async (attrName, attrValue, callback) => {
            await processCommand('wiy:data', attrName, attrValue, async (key, value, firstObserve) => {
                if (firstObserve && _.isUndefined(value)) {//首次赋值时，值未定义，则忽略
                    return;
                }
                await callback(key, value);
            });
        };
        const assignValue = (expression, value) => {
            expression = `${expression}=__newValue__`;
            let ast;
            try {
                ast = parseAst(expression);
            } catch (e) { }
            ast && this.renderValue(expression, [
                ...extraContexts,
                { __newValue__: value, }
            ]);
        };

        const nodeName = node.nodeName;
        const isSlot = nodeName === 'SLOT';
        const componentConfig = this.getComponentConfig(nodeName);
        const listeners = {};
        const dataBinders = [];
        const slotData = isSlot ? tryCreateProxy({}) : null;
        for (const attrName in attrs) {
            const attrNode = attrs[attrName];
            await this.renderTextOrAttr(attrNode, extraContexts);
            if (attrName.startsWith('wiy:')) {
                const attrValue = removeAttr(node, attrName);
                if (attrName.startsWith('wiy:on')) {
                    const eventType = attrName.slice(6);
                    const eventHandler = (e) => {
                        const handler = this.renderValue(attrValue, extraContexts);
                        if (_.isFunction(handler)) {
                            handler(e);
                        }
                    };
                    listeners[eventType] = [
                        ...(listeners[eventType] || []),
                        eventHandler,
                    ];
                } else if (attrName === 'wiy:template') {
                    node.innerHTML = this.getTemplate(attrValue);
                } else if (attrName === 'wiy:html') {
                    await this.observe(async () => {
                        return await this.actual(this.renderValue(attrValue, extraContexts));
                    }, async (result, firstObserve) => {
                        await remove(node.childNodes);
                        if (!_.isNil(result)) {
                            node.innerHTML = result;
                            !firstObserve && await this.renderNodes(node.childNodes, extraContexts);
                        }
                    }, node, attrValue);
                } else if (attrName.startsWith('wiy:attr')) {
                    await processCommand('wiy:attr', attrName, attrValue, (key, value) => {
                        if (_.isNil(value)) {
                            node.removeAttribute(key);
                        } else {
                            node.setAttribute(key, value);
                        }
                    });
                } else if (attrName.startsWith('wiy:class')) {
                    await processCommand('wiy:class', attrName, attrValue, (key, value) => {
                        if (!value) {
                            node.classList.remove(key);
                        } else {
                            node.classList.add(key);
                        }
                    });
                } else if (attrName.startsWith('wiy:style')) {
                    await processCommand('wiy:style', attrName, attrValue, (key, value) => {
                        if (_.isNil(value)) {
                            node.style.removeProperty(key);
                        } else {
                            node.style.setProperty(key, value);
                        }
                    });
                } else if (attrName.startsWith('wiy:data')) {
                    const bindAttrName = getCommandBindAttrName('wiy:data', attrName);
                    if (_.isNil(bindAttrName)) {
                        continue;
                    }
                    const key = toStandardName('wiy:data', bindAttrName);

                    if (componentConfig) {//组件
                        dataBinders.push(async (component) => {
                            await bindData(attrName, attrValue, (key, value) => {
                                component[key] = value;
                            });
                        });

                        const eventHandler = (e) => {
                            const newData = e.data;
                            if (key) {//绑定具体属性
                                if (key in newData) {//变化数据中包含该属性
                                    assignValue(attrValue, newData[key]);
                                }
                            } else {
                                Object.entries(newData).forEach(([key, value]) => {
                                    assignValue(`${attrValue}['${key}']`, value);
                                });
                            }
                        };
                        listeners['change'] = [
                            eventHandler,
                            ...(listeners['change'] || []),
                        ];
                        listeners['datainit'] = [
                            eventHandler,
                            ...(listeners['datainit'] || []),
                        ];
                    } else if (isSlot) {
                        await bindData(attrName, attrValue, (key, value) => {
                            slotData[key] = value;
                        });
                    } else {//普通标签
                        if (key) {//必须绑定具体属性
                            await bindData(attrName, attrValue, (key, value) => {
                                if (_.isNil(value)) {
                                    node[key] = null;
                                } else {
                                    node[key] = value;
                                }
                            });

                            const eventHandler = (e) => {
                                assignValue(attrValue, node[key]);
                            };
                            listeners['change'] = [
                                eventHandler,
                                ...(listeners['change'] || []),
                            ];
                        }
                    }
                } else if (attrName.startsWith('wiy:method')) {
                    if (isSlot) {
                        await processCommand('wiy:method', attrName, attrValue, (key, value) => {
                            slotData[key] = value;
                        });
                    }
                }
            }
        }

        if (componentConfig) {
            return await this.renderComponent(node, extraContexts, listeners, dataBinders);
        } else {
            Object.entries(listeners).forEach(([name, value]) => {
                value.forEach(listener => {
                    node.addEventListener(name, listener);
                });
            });

            if (isSlot) {
                return await this.renderSlot(node, extraContexts, slotData);
            } else if (nodeName === 'TEMPLATE') {
                return await this.renderTemplate(node, extraContexts);
            } else {
                await this.renderNodes(node.childNodes, extraContexts);
                return node;
            }
        }
    }

    async renderTemplate(node, extraContexts = []) {
        if (node.id) {
            return node;
        }

        const list = [];

        const pointer = document.createTextNode('');//指示template块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        const childNodes = node.content.childNodes;
        for (const childNode of childNodes) {
            childNode._wiySlots = node._wiySlots;
        }
        list[1] = await this.renderNodes(childNodes, extraContexts);
        await insertAfter(pointer, list[1]);

        return list;
    }

    async renderSlot(node, extraContexts = [], slotData) {
        const slotName = node.name || '';

        const slots = this._config.slots;

        let slotInfo = slots[slotName] || {};
        slots[slotName] = slotInfo;
        slotInfo = slots[slotName];//获取响应式对象
        slotInfo.active = true;
        slotInfo.data = slotData;

        const fragment = nodesToDocumentFragment(node.childNodes);
        const pointer = document.createTextNode('');//指示slot默认内容块的位置
        node.appendChild(pointer);
        let content;

        await this.observe(() => {
            return !!slotInfo.assigned;
        }, async (assigned) => {
            if (content) {//有旧内容
                await remove(content);//移除旧内容   
                content = null;
            }

            if (!assigned) {//需要渲染
                content = await this.renderNode(cloneNode(fragment, true), extraContexts);
                await insertAfter(pointer, content);
            }
        }, node, `${slotName} assigned`);

        return node;
    }

    async renderWiyLet(node, extraContexts = [], varName) {
        const list = [];

        const varExpr = removeAttr(node, `wiy:let-${varName}`);
        varName = _.camelCase(varName);

        const pointer = document.createTextNode('');//指示wiy:let块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        const localContext = tryCreateProxy({});
        await this.observe(async () => {
            return await this.actual(this.renderValue(varExpr, extraContexts));
        }, (result) => {
            localContext[varName] = result;
        }, pointer, varExpr);

        list[1] = await this.renderElement(node, [
            ...extraContexts,
            localContext,
        ]);
        await insertAfter(pointer, list[1]);

        return list;
    }

    async renderWiyIf(node, extraContexts = []) {
        const list = [];

        const condition = removeAttr(node, 'wiy:if');

        const pointer = document.createTextNode('');//指示wiy:if块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        await this.observe(async () => {
            return !!(await this.actual(this.renderValue(condition, extraContexts)));
        }, async (result) => {
            if (list[1]) {//有旧内容
                await remove(list[1]);//移除旧内容
                list[1] = null;
            }

            if (result) {//需要渲染
                list[1] = await this.renderElement(cloneNode(node, true), extraContexts);
                await insertAfter(pointer, list[1]);
            }
        }, pointer, condition);

        return list;
    }

    async renderWiyFor(node, extraContexts = []) {
        const list = [];

        const forObj = removeAttr(node, 'wiy:for');
        const indexName = removeAttr(node, 'wiy:for.index') || 'index';
        const keyName = removeAttr(node, 'wiy:for.key') || 'key';
        const valueName = removeAttr(node, 'wiy:for.value') || 'value';
        const idGetter = (await this.renderValue(removeAttr(node, 'wiy:for.id'), extraContexts)) || ((value, key) => {
            return key;
        });

        const pointer = document.createTextNode('');//指示wiy:for块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        const adjustContents = async (oldContents, newContents) => {
            if (oldContents) {
                for (const oldContent of oldContents) {
                    await remove(oldContent, !newContents.includes(oldContent));
                }
            }
            await insertAfter(pointer, newContents);
        };

        const map = new Map();//之前渲染好的内容map，key是数组或对象的id，value是之前该id对应的数据
        await this.observe(async () => {
            return await this.actual(this.renderValue(forObj, extraContexts));
        }, async (result) => {
            if (_.isNil(result)) {
                result = [];
            }

            const isArray = Array.isArray(result);

            await this.observe(() => {
                return Object.keys(result);
            }, async (keys) => {
                const contents = [];
                const ids = new Set();
                for (let i = 0, max = keys.length; i < max; i++) {
                    const index = i;
                    const key = isArray ? parseInt(keys[i]) : keys[i];

                    const cache = await this.observe(async () => {
                        return await this.actual(result[key]);//这一行是为了观察obj中该key对应的value的变化，这样的话当该key对应的value变化时才能被通知
                    }, (value) => {
                        const id = idGetter(value, key);
                        const cache = map.get(id) || {
                            id,
                            localContext: tryCreateProxy({}),
                        };
                        map.set(id, cache);
                        const { localContext } = cache;
                        localContext[indexName] = index;
                        localContext[keyName] = key;
                        localContext[valueName] = value;
                        return cache;
                    }, pointer, `${forObj}[${key}]`);

                    let {
                        id,
                        localContext,
                        content,
                    } = cache;
                    ids.add(id);

                    if (!content) {//没有之前渲染好的内容
                        content = await this.renderElement(cloneNode(node, true), [
                            ...extraContexts,
                            localContext,
                        ]);
                        cache.content = content;//缓存内容
                    }
                    contents.push(content);
                }

                for (const [id] of map) {//删除原有的多余的id
                    if (!ids.has(id)) {
                        map.delete(id);
                    }
                }

                await adjustContents(list[1], contents);
                list[1] = contents;
            }, pointer, `Object.keys(${forObj})`);
        }, pointer, forObj);

        return list;
    }

    async renderWiySlot(node, extraContexts = []) {
        const list = [];

        let slot;
        let dataName;
        if (node.nodeType === Node.ELEMENT_NODE) {
            slot = removeAttr(node, 'wiy:slot');
            dataName = removeAttr(node, 'wiy:slot.data');
        }
        slot = slot || '';
        dataName = dataName || 'slotData';

        const slots = node._wiySlots;

        const pointer = document.createTextNode('');//指示wiy:slot块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        await this.observe(() => {
            return this.renderString(slot, extraContexts);
        }, async (slotName) => {
            let slotInfo = slots[slotName] || {};
            slots[slotName] = slotInfo;
            slotInfo = slots[slotName];//获取响应式对象
            slotInfo.assigned = true;

            await this.observe(() => {
                return !!slotInfo.active;
            }, async (active) => {
                if (list[1]) {//有旧内容
                    await remove(list[1]);//移除旧内容
                    list[1] = null;
                }

                if (active) {//需要渲染
                    const localContext = tryCreateProxy({});
                    await this.observe(() => {
                        return slotInfo.data;//观察插槽数据变化
                    }, (slotData) => {
                        localContext[dataName] = slotData;
                    });

                    list[1] = await this.renderNode(cloneNode(node, true), [
                        ...extraContexts,
                        localContext,
                    ]);
                    toNodeList(list[1]).forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            node.setAttribute('slot', slotName);
                        }
                    });
                    await insertAfter(pointer, list[1]);
                }
            }, pointer, `${slotName} active`);
        }, pointer, slot);

        return list;
    }

    async renderNodes(nodes, extraContexts = []) {
        const list = [];
        for (const node of Array.from(nodes)) {
            list.push(await this.renderNode(node, extraContexts));
        }
        return list;
    }

    async renderNode(node, extraContexts = []) {
        switch (node.nodeType) {
            case Node.TEXT_NODE:
                return await this.renderTextOrAttr(node, extraContexts);
            case Node.ELEMENT_NODE:
                return await this.renderElement(node, extraContexts);
            case Node.DOCUMENT_FRAGMENT_NODE:
                return await this.renderNodes(node.childNodes, extraContexts);
            default:
                return node;
        }
    }

    async renderComponent(node, extraContexts = [], listeners, dataBinders) {
        const slots = tryCreateProxy({});

        for (const childNode of Array.from(node.childNodes)) {
            childNode._wiySlots = slots;
            if (childNode.nodeType === Node.ELEMENT_NODE) {
                await this.renderElement(childNode, extraContexts);
            } else {
                await this.renderWiySlot(childNode, extraContexts);
            }
        }

        const define = await loadComponentDefine(this.getComponentConfig(node.nodeName));
        const component = new Component({
            ...define,
            listeners,
            dataBinders,
            slots,
            app: this._config.app,
        });
        this.addChild(component);

        node.style.setProperty('visibility', 'hidden');
        component.on('init', async () => {
            await component.mount(node);
            node.style.removeProperty('visibility');
        });

        return node;
    }

    renderString(template, extraContexts = []) {
        return this.renderValue(`\`${template.replaceAll('{{', '${').replaceAll('}}', '}')}\``, extraContexts);
    }

    renderValue(expression, extraContexts = []) {
        return renderValueInContexts(expression, [
            { this: this._proxyThis },
            ...extraContexts,
        ]);
    }
}
Object.defineProperties(Component.prototype, {
    _proxyIgnoreProps: {
        writable: false,
        configurable: false,
        enumerable: false,
        value: new Set([
            '_uuid',
            '_config',
            '_element',
            '_parent',
            '_children',
            '_oldElement',
            '_oldParent',
            '_oldChildren',
            '_observerStatus',
            ...Object.getOwnPropertyNames(Component.prototype),
        ]),
    },
});

class App extends EventTarget {
    constructor(config = {}) {
        super();
        Object.defineProperties(this, {
            _uuid: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: parseInt(_.uniqueId()),
            },
            _config: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: config,
            },
            _currentPage: {
                writable: true,
                configurable: false,
                enumerable: false,
            },
            _router: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: new Router(),
            },
        });

        const proxy = tryCreateProxy(this);
        proxy.init().then(() => {
            proxy._router.updateStatus();
        });
        return proxy;
    }

    async executeLifecycle(name, data) {
        const lifecycleFunction = (this._config.lifecycle || {})[name];
        lifecycleFunction && await lifecycleFunction.bind(this._proxyThis)(data);
        this.trigger(name.toLowerCase(), data);
    }

    async init() {
        if (!this._config.index) {
            throw new Error('未配置index');
        }

        await this.executeLifecycle('beforeInit');
        this._config.components = this._config.components || {};
        this._config.container = this._config.container || document.body;

        Object.entries(this._config.components).forEach(([name, value]) => {
            this.registerComponent(name, value);
        });
        Object.entries(this._config.methods || {}).forEach(([name, value]) => {
            this.registerMethod(name, value);
        });
        let data = this._config.data;
        if (_.isFunction(data)) {
            data = data.bind(this._proxyThis)();
        }
        Object.entries(data || {}).forEach(([name, value]) => {
            this[name] = value;
        });

        const cssCode = await loadSourceString(this._config.style) || '';
        if (cssCode) {
            const style = document.createElement('style');
            style.innerHTML = cssCode;
            document.head.appendChild(style);
        }

        for (const plugin of (this._config.plugins || [])) {
            const define = await loadPluginDefine(plugin);
            await define.install(this._proxyThis);
        }

        this._router.addEventListener('change', e => {
            if (e.data.path) {
                this.renderPage(e.data);
            } else {
                this._router.replace(this._config.index, e.data.params);
            }
        });
        this._router.updateStatus(false);

        await this.executeLifecycle('init');
    }

    getRouter() {
        return this._router;
    }

    getComponentConfig(name) {
        return this._config.components[_.kebabCase(name)];
    }

    on(eventType, listener) {
        this._rawThis.addEventListener(eventType, listener);
    }

    trigger(eventType, data, cause) {
        this._rawThis.dispatchEvent(new WiyEvent(eventType, data, cause));
    }

    async renderPage(info) {
        if (!(this._config.pages[info.path] || this._config.pages[this._config.index])) {
            throw new Error(`未找到页面${info.path}`);
        }

        await new Promise(async (resolve) => {
            const showPage = async (page) => {
                if (this._currentPage) {
                    await this._currentPage.remove();
                }
                this._currentPage = page;

                const element = page._oldElement || document.createElement('wiy-page');
                this._config.container.appendChild(element);
                await page.mount(element);
                resolve();
            };

            const define = await loadComponentDefine(this._config.pages[info.path] || this._config.pages[this._config.index]);
            if (define._uuid === this._currentPage?._config._uuid) {
                resolve();
            } else {
                const page = this.newComponent(define);
                page.on('init', () => {
                    showPage(page);
                });
            }
        });
    }

    registerComponent(name, component) {
        this._config.components[_.kebabCase(name)] = component;
    }

    registerComponents(components) {
        Object.entries(components).forEach(([name, component]) => {
            this.registerComponent(name, component);
        });
    }

    registerMethod(name, method) {
        Object.defineProperty(this, name, {
            writable: false,
            configurable: false,
            enumerable: false,
            value: method.bind(this._proxyThis),
        });
    }

    registerMethods(methods) {
        Object.entries(methods).forEach(([name, method]) => {
            this.registerMethod(name, method);
        });
    }

    newComponent(define) {
        return new Component({
            ...define,
            app: this._proxyThis,
        });
    }
}
Object.defineProperties(App.prototype, {
    _proxyIgnoreProps: {
        writable: false,
        configurable: false,
        enumerable: false,
        value: new Set([
            '_uuid',
            '_config',
            '_currentPage',
            '_router',
            ...Object.getOwnPropertyNames(App.prototype),
        ]),
    },
});

class Router extends EventTarget {
    constructor(config = {}) {
        super();
        Object.defineProperties(this, {
            _config: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: config,
            },
            _base: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: wiyEnv.publicPath,
            },
            _current: {
                writable: false,
                configurable: false,
                enumerable: false,
                value: tryCreateProxy({}),
            },
        });

        this.init().then(() => {
            this.dispatchEvent(new WiyEvent('init'));
        });
    }

    async init() {
        window.addEventListener('popstate', (e) => {
            this.updateStatus(true, e);
        });
    }

    updateStatus(change = true, cause) {
        const base = this._base;
        const url = new URL(location);
        const path = url.pathname.replaceAll(/\/{2,}/g, '/');

        if (path.startsWith(base)) {
            this._current.path = path.slice(base.length);
            const urlParams = Array.from(url.searchParams.entries());//兼容性问题：firefox中URL.searchParams.entries()无reduce方法
            this._current.params = urlParams.reduce((params, [name, value]) => {
                params[name] = value;
                return params;
            }, {});
        }

        change && this.dispatchEvent(new WiyEvent('change', this._current, cause));
    }

    getBase() {
        return this._base;
    }

    getCurrent() {
        return this._current;
    }

    isInternalLink(link) {
        return !_.isNil(this.toRelativePath(link));
    }

    toRelativePath(link) {
        const href = new URL(link, location).href;
        const baseHref = new URL(this._base, location).href;
        if (href.startsWith(baseHref)) {
            return href.slice(baseHref.length);
        }
    }

    toUrl(path, params = {}, clearOldParams = true) {
        const oldUrl = new URL(location);
        const oldParams = Array.from(oldUrl.searchParams.entries());
        oldUrl.search = '';

        const url = path ? new URL(this._base + path, location) : new URL(location);
        const newParams = Array.from(url.searchParams.entries());

        if (!clearOldParams) {
            oldParams.forEach(([name, value]) => {//原url中的参数
                url.searchParams.set(name, value);
            });
        }

        newParams.forEach(([name, value]) => {//新url中的参数
            url.searchParams.set(name, value);
        });

        Object.entries(params).forEach(([name, value]) => {//额外传入的参数
            url.searchParams.set(name, value);
        });
        return url;
    }

    go(path, params = {}, clearOldParams = true) {
        const newUrl = this.toUrl(path, params, clearOldParams);
        if (newUrl.href === location.href) {
            return;
        }
        history.pushState(null, null, newUrl);
        this.updateStatus();
    }

    replace(path, params = {}, clearOldParams = true) {
        const newUrl = this.toUrl(path, params, clearOldParams);
        if (newUrl.href === location.href) {
            return;
        }
        history.replaceState(null, null, newUrl);
        this.updateStatus();
    }

    back() {
        history.back();
    }

    forward() {
        history.forward();
    }
}

class WiyEvent extends Event {
    constructor(type, data, cause) {
        super(type);
        this.data = data;
        this.cause = cause;
    }
}

export default {
    App,
};