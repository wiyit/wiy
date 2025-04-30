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
const renderValueInContexts = (expression, contexts = []) => {
    let ast;
    try {
        ast = parseExpressionAt(expression, 0, { ecmaVersion: 'latest' });
    } catch (e) {
        throw new SyntaxError(`${e.message}\n表达式：\n${expression}\n`);
    }

    const variableNames = new Set();
    walk(ast, {
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
const loadComponentDefine = async (component) => {
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
        });
    }

    enqueue(element) {
        this._items.push(element);
    }

    dequeue() {
        return this._items.shift();
    }

    peek() {
        return this._items[0];
    }

    size() {
        return this._items.length;
    }

    isEmpty() {
        return this.size() == 0;
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

    peek() {
        return this._items[this.size() - 1];
    }

    size() {
        return this._items.length;
    }

    isEmpty() {
        return this.size() == 0;
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
                const item = this._queue.dequeue();
                if (!item.observer.isActive()) {
                    continue;
                }
                try {
                    await item.observer.process(item.notifier);
                } catch (e) {
                    console.error(e, item);
                }
            }
            window.requestAnimationFrame(update);
        };
        window.requestAnimationFrame(update);
    }

    push(observer) {
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
            if (observer.isActive()) {
                this._queue.enqueue({
                    observer,
                    notifier: {
                        target,
                        prop,
                        propsChanged,
                    },
                });
            }
        });
    }

    pause(component) {
        this._map.forEach((temp, target) => {
            temp.forEach((observers, prop) => {
                observers.forEach(observer => {
                    if (observer.getComponent()._rawThis == component._rawThis) {
                        observer.pause();
                    }
                });
            });
        });
    }

    continue(component) {
        this._map.forEach((temp, target) => {
            temp.forEach((observers, prop) => {
                observers.forEach(observer => {
                    if (observer.getComponent()._rawThis == component._rawThis) {
                        observer.continue();
                    }
                });
            });
        });
    }

    destroyByComponent(component) {
        this._map.forEach((temp, target) => {
            temp.forEach((observers, prop) => {
                observers.forEach(observer => {
                    if (observer.getComponent()._rawThis == component._rawThis) {
                        observer.destroy();
                        observers.delete(observer);
                    }
                });
            });
        });
    }

    destroyByNode(node) {
        this._map.forEach((temp, target) => {
            temp.forEach((observers, prop) => {
                observers.forEach(observer => {
                    if (observer.getDestroyWithNode() == node) {
                        observer.destroy();
                        observers.delete(observer);
                    }
                });
            });
        });
    }

    delete(observer) {
        this._map.forEach((temp, target) => {
            temp.forEach((observers, prop) => {
                observers.delete(observer);
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
                value: config.component._proxyThis,
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

    getComponent() {
        return this._component;
    }

    getDestroyWithNode() {
        return this._destroyWithNode;
    }

    pause() {
        this._status = 'pause';
    }

    continue() {
        this._status = 'active';
    }

    destroy() {
        this._status = 'destroy';
    }

    isActive() {
        return this._status == 'active';
    }
}
const isProxyObj = (obj) => {
    return _.isObject(obj) && !!obj._proxyUuid;
};
const tryCreateProxy = (obj) => {
    if (!_.isObject(obj) || isProxyObj(obj) || obj instanceof Date || obj instanceof Node) {
        return obj;
    }
    const proxyObj = new Proxy(obj, {
        has(target, prop) {
            const has = Reflect.has(target, prop);
            const propDesc = Reflect.getOwnPropertyDescriptor(target, prop);
            if (!has || propDesc?.writable) {
                OBSERVER_MANAGER.observe(target, prop);
            }
            return has;
        },
        get(target, prop) {
            const has = Reflect.has(target, prop);
            let value = Reflect.get(target, prop);
            const propDesc = Reflect.getOwnPropertyDescriptor(target, prop);
            if (!has || propDesc?.writable) {
                value = tryCreateProxy(value);
                if (isProxyObj(value)) {
                    Reflect.set(target, prop, value);
                }
                OBSERVER_MANAGER.observe(target, prop);
            }
            return value;
        },
        ownKeys(target) {
            const result = Reflect.ownKeys(target);
            OBSERVER_MANAGER.observe(target);
            return result;
        },
        set(target, prop, value) {//如果加了receiver，就会和defineProperty重复触发
            const propsChanged = !Reflect.has(target, prop);
            const oldValue = Reflect.get(target, prop);
            const propDesc = Reflect.getOwnPropertyDescriptor(target, prop);
            if (propDesc?.writable) {
                value = tryCreateProxy(value);
            }
            const result = Reflect.set(target, prop, value);
            if (propsChanged || value != oldValue
                || (Array.isArray(target) && prop == 'length')) {
                OBSERVER_MANAGER.notify(target, prop, propsChanged);
            }
            return result;
        },
        deleteProperty(target, prop) {
            const result = Reflect.deleteProperty(target, prop);
            OBSERVER_MANAGER.notify(target, prop, true);
            return result;
        },
        defineProperty(target, prop, attributes) {
            const result = Reflect.defineProperty(target, prop, attributes);
            OBSERVER_MANAGER.notify(target, prop, true);
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



const destroy = async (obj) => {
    if (obj instanceof Node) {
        switch (obj.nodeType) {
            case Node.DOCUMENT_FRAGMENT_NODE:
                for (let childNode of obj.childNodes) {
                    await destroy(childNode);
                }
                break;
            case Node.ELEMENT_NODE:
                for (let childNode of obj.childNodes) {
                    await destroy(childNode);
                }
                await obj._wiyComponent?.destroy();
                break;
        }
        OBSERVER_MANAGER.destroyByNode(obj);//终止观察
        return;
    }

    const nodeList = toNodeList(obj);
    for (let node of nodeList) {
        await destroy(node);
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
    const temp = document.createComment('');
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
        for (let item of obj) {
            if (_.isUndefined(item)) {
                continue;
            }
            for (let node of toNodeList(item)) {
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
        });

        const proxy = tryCreateProxy(this);
        proxy.init();
        return proxy;
    }

    async executeLifecycle(name, data) {
        const lifecycleFunction = (this._config.lifecycle || {})[name];
        lifecycleFunction && await Promise.resolve(lifecycleFunction.bind(this._proxyThis)(data));
        this.trigger(name.toLowerCase(), data);
    }

    async init() {
        await this.executeLifecycle('beforeInit');
        this._config.components = this._config.components || {};

        Object.entries(this._config.components).forEach(([name, value]) => {
            this._config.components[name.toUpperCase()] = value;
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
        for (let [name, value] of Object.entries(this._config.dataBinders || {})) {
            await value(this);
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
            if (!_.isUndefined(value)) {
                this._proxyThis[name] = value;
            }
        });
    }

    attr(name) {
        return this._element?.getAttribute(name);
    }

    hasAttr(name) {
        return this._element?.hasAttribute(name);
    }

    hasSlotTemplate(name = '') {
        return !_.isUndefined(this._config.slotRenderers[name]);
    }

    on(eventType, listener) {
        this._rawThis.addEventListener(eventType, listener);
    }

    trigger(eventType, data, cause) {
        this._rawThis.dispatchEvent(new WiyEvent(eventType, data, cause));
    }

    onEventPath(e) {
        return e.composedPath().some(node => {
            return node == this || node._rawThis == this._rawThis || node == this._element;
        });
    }

    getElement(id) {
        if (!id) {
            return this._element;
        }
        return this._element?.shadowRoot.getElementById(id);
    }

    getComponent(id) {
        const element = this.getElement(id);
        return element ? element._wiyComponent : undefined;
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
        component._parent = undefined;
    }

    raw(obj) {
        return tryCreateProxy(obj)?._rawThis || obj;
    }

    proxy(obj) {
        return tryCreateProxy(obj)?._proxyThis || obj;
    }

    async mount(element) {
        if (this._element) {
            throw new Error(`${this._uuid}已挂载，无法重复挂载`);
        }
        if (this._oldElement && this._oldElement != element) {
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
            for (let child of this._oldChildren) {//挂载所有子组件
                await child.mount(child._oldElement);
            }

            this._oldElement = undefined;
            this._oldParent = undefined;
            this._oldChildren.clear();

            OBSERVER_MANAGER.continue(this);//继续观察
        } else {
            element.setAttribute('uuid', this._uuid);
            Object.entries(this._config.listeners || {}).forEach(([name, value]) => {
                element.addEventListener(name, value);
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
        if (!this._element) {
            throw new Error(`${this._uuid}未挂载，无法卸载`);
        }

        await this.executeLifecycle('beforeUnmount');

        OBSERVER_MANAGER.pause(this);//暂停观察

        this._oldElement = this._element;
        this._oldParent = this._parent;
        for (let child of this._children) {
            await child.unmount();
            this._oldChildren.add(child);
        }

        this._parent?.removeChild(this);//解除父子组件关联

        //解除element与组件关联
        this._element._wiyComponent = undefined;
        this._element = undefined;

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

        OBSERVER_MANAGER.destroyByComponent(this);//终止观察

        for (let child of this._oldChildren) {
            await child.destroy();
        }

        await this.executeLifecycle('destroy');
    }

    async observe(func, callback, destroyWithNode, info) {
        let firstObserve = true;
        let oldResult;
        const startObserve = async (notifier) => {
            let result;
            let needCallback = false;
            OBSERVER_MANAGER.push(observer);
            try {
                result = await func();
                if (!firstObserve && !_.isObject(result) && oldResult == result) {
                    return;
                }
                needCallback = true;
            } finally {
                OBSERVER_MANAGER.pop();
                if (needCallback) {
                    const callbackResult = await callback(result, firstObserve, notifier);
                    firstObserve = false;
                    oldResult = result;
                    return callbackResult;
                }
            }
        };
        const observer = new Observer({
            callback: async (notifier) => {
                OBSERVER_MANAGER.delete(observer);
                await startObserve(notifier);
            },
            info,
            component: this,
            destroyWithNode,
        });
        return await startObserve();
    }

    async renderTextOrAttr(node, extraContexts = []) {
        const originNodeValue = node.nodeValue;
        if (originNodeValue?.includes('{{')) {
            await this.observe(() => {
                return this.renderString(originNodeValue, extraContexts);
            }, (result) => {
                node.nodeValue = result;
            }, node.ownerElement || node, originNodeValue);
        }
        return node;
    }

    async renderElement(node, extraContexts = []) {
        const letAttrNode = Array.from(node.attributes).find((attrNode) => {
            return attrNode.nodeName.startsWith('wiy:let-');
        });
        if (letAttrNode) {
            return await this.renderLet(node, extraContexts, letAttrNode.nodeName.slice(8));
        }
        if (node.hasAttribute('wiy:if')) {
            return await this.renderIf(node, extraContexts);
        }
        if (node.hasAttribute('wiy:for')) {
            return await this.renderFor(node, extraContexts);
        }
        if (node.hasAttribute('wiy:slot')) {
            const slot = await this.renderString(removeAttr(node, 'wiy:slot') || '', extraContexts);
            node._wiySlotInfo = {
                slot,
                contexts: [
                    { this: this._proxyThis },
                    ...extraContexts,
                ],
            };
            return node;
        }

        const listeners = {};
        const dataBinders = {};
        for (let attrNode of Array.from(node.attributes)) {//需先转成数组，防止遍历过程中删除属性导致遍历出错
            await this.renderTextOrAttr(attrNode, extraContexts);
            const attrName = attrNode.nodeName;
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
                    node.addEventListener(eventType, eventHandler);
                    listeners[eventType] = [
                        ...(listeners[eventType] || []),
                        eventHandler,
                    ];
                } else if (attrName == 'wiy:html') {
                    await this.observe(() => {
                        return this.renderValue(attrValue, extraContexts);
                    }, (result) => {
                        if (_.isUndefined(result) || _.isNull(result)) {
                            node.innerHTML = '';
                        } else {
                            node.innerHTML = result;
                        }
                    }, node, attrValue);
                } else if (attrName.startsWith('wiy:attr-')) {
                    let bindAttrName;
                    if (attrName.startsWith('wiy:attr-')) {
                        bindAttrName = attrName.slice(9);
                    }
                    if (bindAttrName) {
                        await this.observe(() => {
                            return this.renderValue(attrValue, extraContexts);
                        }, (result) => {
                            if (_.isUndefined(result) || _.isNull(result)) {
                                node.removeAttribute(bindAttrName);
                            } else {
                                node.setAttribute(bindAttrName, result);
                            }
                        }, node, attrValue);
                    }
                } else if (attrName.startsWith('wiy:style')) {
                    let bindAttrName;
                    if (attrName.startsWith('wiy:style-')) {
                        bindAttrName = attrName.slice(10);
                    } else if (attrName != 'wiy:style') {
                        continue;
                    }

                    await this.observe(() => {
                        const result = this.renderValue(attrValue, extraContexts);
                        if (!bindAttrName && _.isObject(result)) {//未绑定具体属性时，实际则需要观察对象中的所有属性的变化
                            if (!isProxyObj(result)) {
                                console.warn(`${attrValue}的值不是响应式对象，可能无法观察其属性变化`);
                            }
                            Object.entries(result);
                        }
                        return result;
                    }, (result) => {
                        if (bindAttrName) {
                            node.style[bindAttrName] = result;
                        } else {
                            Object.entries(result || {}).forEach(([key, value]) => {
                                node.style[key] = value;
                            });
                        }
                    }, node, attrValue);
                } else if (attrName.startsWith('wiy:data')) {
                    let bindAttrName;
                    if (attrName.startsWith('wiy:data-')) {
                        bindAttrName = attrName.slice(9);
                    } else if (attrName != 'wiy:data') {
                        continue;
                    }

                    let eventType;
                    if (this._config.components[node.nodeName] || this._config.app._config.components[node.nodeName]) {
                        eventType = 'change';
                        dataBinders[bindAttrName || ''] = async (component) => {
                            await this.observe(() => {
                                const result = this.renderValue(attrValue, extraContexts);
                                if (!bindAttrName && _.isObject(result)) {//未绑定具体属性时，实际则需要观察对象中的所有属性的变化
                                    if (!isProxyObj(result)) {
                                        console.warn(`${attrValue}的值不是响应式对象，可能无法观察其属性变化`);
                                    }
                                    Object.entries(result);
                                }
                                return result;
                            }, (result) => {
                                component.setData(bindAttrName ? {
                                    [bindAttrName]: result,
                                } : result);
                            }, node, attrValue);
                        };
                    } else {
                        switch (node.nodeName) {
                            case 'INPUT':
                                switch (node.getAttribute('type')) {
                                    case 'checkbox':
                                    case 'radio':
                                        bindAttrName = bindAttrName || 'checked';
                                        eventType = 'change';
                                        break;
                                    default:
                                        bindAttrName = bindAttrName || 'value';
                                        eventType = 'change';
                                        break;
                                }
                                break;
                            case 'TEXTAREA':
                            case 'SELECT':
                                bindAttrName = bindAttrName || 'value';
                                eventType = 'change';
                                break;
                        }
                        if (bindAttrName) {
                            await this.observe(() => {
                                return this.renderValue(attrValue, extraContexts);
                            }, (result) => {
                                if (_.isUndefined(result) || _.isNull(result)) {
                                    delete node[bindAttrName];
                                } else {
                                    node[bindAttrName] = result;
                                }
                            }, node, attrValue);
                        }
                    }

                    if (eventType) {
                        const eventHandler = (e) => {
                            let newData;
                            if (e instanceof WiyEvent) {
                                newData = e.data;
                            } else {
                                newData = node;
                            }
                            if (bindAttrName) {
                                if (bindAttrName in newData) {
                                    this.renderValue(`${attrValue}=__newValue__`, [
                                        ...extraContexts,
                                        { __newValue__: newData[bindAttrName], }
                                    ]);
                                }
                            } else {
                                Object.entries(newData).forEach(([key, value]) => {
                                    this.renderValue(`${attrValue}['${key}']=__newValue__`, [
                                        ...extraContexts,
                                        { __newValue__: value, }
                                    ]);
                                });
                            }
                        };
                        node.addEventListener(eventType, eventHandler);
                        listeners[eventType] = [
                            ...(listeners[eventType] || []),
                            eventHandler,
                        ];
                        listeners['datainit'] = [
                            ...(listeners['datainit'] || []),
                            eventHandler,
                        ];
                    }
                }
            }
        }

        if (this._config.components[node.nodeName] || this._config.app._config.components[node.nodeName]) {
            return await this.renderComponent(node, extraContexts, listeners, dataBinders);
        } else {
            if (node.nodeName == 'SLOT') {
                return await this.renderSlot(node, extraContexts);
            } else if (node.nodeName == 'TEMPLATE') {
                return await this.renderNodes(node.content.childNodes, extraContexts);
            } else {
                await this.renderNodes(node.childNodes, extraContexts);
                return node;
            }
        }
    }

    async renderSlot(node, extraContexts = []) {
        const slotName = node.name || '';
        let renderers = this._config.slotRenderers[slotName];
        if (!renderers) {
            renderers = [async () => {
                await this.renderNodes(node.childNodes, extraContexts);
            }];
        }
        if (!renderers.executed) {
            for (let renderer of renderers) {
                await renderer();
            }
            renderers.executed = true;
        }
        return node;
    }

    async renderLet(node, extraContexts = [], varName) {
        const list = [];

        const varExpr = removeAttr(node, `wiy:let-${varName}`);

        const pointer = document.createComment('let');//指示let块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        const localContext = tryCreateProxy({});
        await this.observe(() => {
            return this.renderValue(varExpr, extraContexts);
        }, async (result) => {
            localContext[varName] = result;
        }, pointer, varExpr);

        const content = await this.renderElement(node, [
            ...extraContexts,
            localContext,
        ]);
        await insertAfter(pointer, content);
        list[1] = content;

        return list;
    }

    async renderIf(node, extraContexts = []) {
        const list = [];

        const condition = removeAttr(node, 'wiy:if');

        const pointer = document.createComment('if');//指示if块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        await this.observe(() => {
            return !!this.renderValue(condition, extraContexts);
        }, async (result) => {
            if (list[1]) {//在if块中
                await remove(list[1]);//移除旧内容
            }

            if (result) {//需要渲染
                const content = await this.renderElement(node.cloneNode(true), extraContexts);
                await insertAfter(pointer, content);
                list[1] = content;
            } else {//不需要渲染
                list[1] = undefined;
            }
        }, pointer, condition);

        return list;
    }

    async renderFor(node, extraContexts = []) {
        const list = [];

        const forObj = removeAttr(node, 'wiy:for');
        const keyName = removeAttr(node, 'wiy:for.key') || 'key';
        const valueName = removeAttr(node, 'wiy:for.value') || 'value';

        const pointer = document.createComment('for');//指示for块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        const adjustContent = async (oldContent, newContent, index) => {
            const oldIndex = list.indexOf(oldContent);
            if (oldIndex == index && oldContent == newContent) {//位置没变，内容没变
                return;
            }

            if (oldContent && oldIndex >= 0) {//在for块中
                await remove(oldContent, oldContent != newContent);
                list[oldIndex] = undefined;
            }

            if (newContent) {
                let prevIndex = index - 1;
                while (prevIndex >= 0) {
                    const prevContent = list[prevIndex];//前一项的内容
                    if (prevContent) {
                        const nodeList = toNodeList(prevContent);
                        for (let i = nodeList.length - 1; i >= 0; i--) {//找到最后一个在dom中的节点
                            const node = nodeList[i];
                            if (node.parentNode == pointer.parentNode || node.isConnected) {//节点没有被移除
                                await insertAfter(node, newContent);
                                list[index] = newContent;
                                return;
                            }
                        }
                    }
                    prevIndex--;
                }
            }
        };

        let map = {};//之前渲染好的内容map，key是数组或对象的key，value是之前该key对应的value和已渲染好的内容
        let oldObj;
        await this.observe(() => {
            const obj = this.renderValue(forObj, extraContexts);
            if (_.isObject(obj)) {
                if (!isProxyObj(obj)) {
                    console.warn(`${forObj}的值不是响应式对象，可能无法观察其属性变化`);
                }
                Object.keys(obj);//这一行是为了观察obj中keys的变化，这样的话当keys变化时才能被通知
            }
            return obj;
        }, async (result) => {
            const isArray = Array.isArray(result);
            let i = 0;
            for (let [key, value] of Object.entries(result)) {
                i++;
                let index = i;
                if (isArray) {
                    key = parseInt(key);
                }

                let oldData = map[key];
                if (oldData && (result == oldObj || value == oldData.value)) {//有之前渲染好的内容
                    const oldContent = oldData.content;
                    await adjustContent(oldContent, oldContent, index);//只需要调节内容位置
                    continue;
                }

                await this.observe(() => {
                    return result[key];//这一行是为了观察obj中该key对应的value的变化，这样的话当该key对应的value变化时才能被通知
                }, async (value) => {
                    const oldContent = oldData ? oldData.content : undefined;

                    if (!(key in result)) {//key被移除
                        await adjustContent(oldContent);//清除内容
                        return;
                    }

                    if (oldData && oldData.value == value) {//key对应的value没有发生变化
                        return;
                    }

                    const content = await this.renderElement(node.cloneNode(true), [
                        ...extraContexts,
                        { [keyName]: key, [valueName]: value, }
                    ]);
                    await adjustContent(oldContent, content, index);//更新内容

                    const data = oldData || {};
                    data.value = value;
                    data.content = content;
                    oldData = map[key] = data;
                }, pointer, `${forObj}[${key}]`);
            }
            while (i < list.length - 1) {//后续index上原有的内容需要清除
                i++;
                await adjustContent(list[i]);//清除内容
            }

            oldObj = result;
        }, pointer, forObj);

        return list;
    }

    async renderNodes(nodes, extraContexts = []) {
        const list = [];
        for (let node of Array.from(nodes)) {
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
        const slotRenderers = {};
        const addRenderer = (slotContentNode, slot = '', contexts = extraContexts) => {
            slot && slotContentNode.setAttribute('slot', slot);
            slotRenderers[slot] = slotRenderers[slot] || [];
            slotRenderers[slot].push(async () => {
                const slotContent = await this.renderNode(slotContentNode, contexts);
                slot && toNodeList(slotContent).filter(n => {
                    return n.nodeType == Node.ELEMENT_NODE;
                }).forEach(n => {
                    n.setAttribute('slot', slot);
                });
            });
        };

        for (let childNode of Array.from(node.childNodes)) {
            if (childNode.nodeType == Node.ELEMENT_NODE && childNode.hasAttribute('wiy:slot')) {
                const content = await this.renderElement(childNode, extraContexts);
                toNodeList(content).filter(n => {
                    return n.nodeType == Node.ELEMENT_NODE;
                }).forEach(slotContentNode => {
                    const { slot, contexts, } = slotContentNode._wiySlotInfo;
                    addRenderer(slotContentNode, slot, contexts);
                });
            }
        }
        Array.from(node.childNodes).filter(n => {
            return n.nodeType != Node.ELEMENT_NODE || !n.hasAttribute('slot');
        }).forEach(slotContentNode => {
            addRenderer(slotContentNode);
        });

        await new Promise(async (resolve) => {
            const define = await loadComponentDefine(this._config.components[node.nodeName] || this._config.app._config.components[node.nodeName]);
            const config = {
                listeners,
                dataBinders,
                slotRenderers,
                app: this._config.app,
            };
            const component = new Component({
                ...define,
                ...config,
            });
            this.addChild(component);
            component.on('init', async () => {
                node.style.visibility = 'hidden';
                component.on('mount', () => {
                    node.style.visibility = '';
                });

                await component.mount(node);
                resolve(component);
            });
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
                value: undefined,
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
        lifecycleFunction && await Promise.resolve(lifecycleFunction.bind(this._proxyThis)(data));
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

        for (let plugin of (this._config.plugins || [])) {
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

        const currentPage = await new Promise(async (resolve) => {
            const showPage = async (page) => {
                if (this._currentPage) {
                    await this._currentPage.destroy();
                }

                this._config.container.innerHTML = '';
                const element = page._oldElement || document.createElement('wiy-page');
                this._config.container.appendChild(element);
                await page.mount(element);
                resolve(page);
            };

            const define = await loadComponentDefine(this._config.pages[info.path] || this._config.pages[this._config.index]);
            if (define._uuid == this._currentPage?._config._uuid) {
                resolve(this._currentPage);
            } else {
                const page = this.newComponent(define);
                page.on('init', () => {
                    showPage(page);
                });
            }
        });
        this._currentPage = currentPage;
    }

    registerComponent(name, component) {
        this._config.components[name.toUpperCase()] = component;
    }

    registerMethod(name, method) {
        Object.defineProperty(this, name, {
            writable: false,
            configurable: false,
            enumerable: false,
            value: method.bind(this._proxyThis),
        });
    }

    newComponent(define) {
        return new Component({
            ...define,
            app: this._proxyThis,
        });
    }
}

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
        return !_.isUndefined(this.toRelativePath(link));
    }

    toRelativePath(link) {
        const href = new URL(link, location).href;
        const baseHref = new URL(this._base, location).href;
        return href.startsWith(baseHref) ? href.slice(baseHref.length) : undefined;
    }

    toUrl(path, params = {}, clearOldParams = true) {
        const url = path ? new URL(this._base + path, location) : new URL(location);
        if (clearOldParams) {
            url.search = '';
        }
        Object.entries(params).forEach(([name, value]) => {
            url.searchParams.set(name, value);
        });
        return url;
    }

    go(path, params = {}, clearOldParams = true) {
        const newUrl = this.toUrl(path, params, clearOldParams);
        if (newUrl.href == location.href) {
            return;
        }
        history.pushState(null, null, newUrl);
        this.updateStatus();
    }

    replace(path, params = {}, clearOldParams = true) {
        const newUrl = this.toUrl(path, params, clearOldParams);
        if (newUrl.href == location.href) {
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