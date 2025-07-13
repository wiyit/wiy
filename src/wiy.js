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

    peek() {
        return this._items[this.size() - 1];
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
                    if (observer.getComponent()._rawThis === component._rawThis) {
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
                    if (observer.getComponent()._rawThis === component._rawThis) {
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
                    if (observer.getComponent()._rawThis === component._rawThis) {
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
                    if (observer.getDestroyWithNode() === node) {
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
        return this._status === 'active';
    }
}
const isProxyObj = (obj) => {
    return _.isObject(obj) && !!obj._proxyUuid;
};
const tryCreateProxy = (obj) => {
    if (!_.isObject(obj) || isProxyObj(obj) || obj instanceof Date || obj instanceof Node || obj instanceof Function || obj instanceof Promise) {
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
                || (Array.isArray(target) && prop === 'length')) {
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
        for (let item of obj) {
            if (_.isNil(item)) {
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
        for (let dataBinder of (this._config.dataBinders || [])) {
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

    trigger(eventType, data, cause) {
        this._rawThis.dispatchEvent(new WiyEvent(eventType, data, cause));
    }

    onEventPath(e) {
        return e.composedPath().some(node => {
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
        return await (_.isFunction(obj) ? obj() : obj);
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

            this._oldElement = null;
            this._oldParent = null;
            this._oldChildren.clear();

            OBSERVER_MANAGER.continue(this);//继续观察
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
        this._element._wiyComponent = null;
        this._element = null;

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

            result = await result;
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
            await this.observe(async () => {
                return await this.actual(this.renderString(originNodeValue, extraContexts));
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
            return await this.renderWiyLet(node, extraContexts, letAttrNode.nodeName.slice(8));
        }
        if (node.hasAttribute('wiy:if')) {
            return await this.renderWiyIf(node, extraContexts);
        }
        if (node.hasAttribute('wiy:for')) {
            return await this.renderWiyFor(node, extraContexts);
        }
        if (node.hasAttribute('wiy:slot') || node.hasAttribute('wiy:slot.data')) {
            return await this.renderWiySlot(node, extraContexts);
        }

        const getCommandBindAttrName = (command, attrName) => {
            const prefix = `${command}-`;
            if (attrName.startsWith(prefix)) {
                return attrName.slice(prefix.length);
            } else if (attrName != command) {
                return;
            }

            if (command === 'wiy:data') {
                switch (node.nodeName) {//部分表单标签在不指定绑定属性时，有默认绑定属性
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
                        for (let [key, value] of entries) {
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

        const componentConfig = this.getComponentConfig(node.nodeName);
        const listeners = {};
        const dataBinders = [];
        const slotData = tryCreateProxy({});
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
                        if (_.isNil(result)) {
                        } else {
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
                    } else if (node.nodeName === 'SLOT') {
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
                    if (node.nodeName === 'SLOT') {
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

            if (node.nodeName === 'SLOT') {
                return await this.renderSlot(node, extraContexts, slotData);
            } else if (node.nodeName === 'TEMPLATE') {
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

        const content = await this.renderNodes(node.content.childNodes, extraContexts);
        await insertAfter(pointer, content);
        list[1] = content;

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

        await this.observe(() => {
            return !!slotInfo.assigned;
        }, async (assigned) => {
            if (!assigned) {
                await this.renderNodes(node.childNodes, extraContexts);
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

        const content = await this.renderElement(node, [
            ...extraContexts,
            localContext,
        ]);
        await insertAfter(pointer, content);
        list[1] = content;

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
            if (list[1]) {//在if块中
                await remove(list[1]);//移除旧内容
            }

            if (result) {//需要渲染
                const content = await this.renderElement(cloneNode(node, true), extraContexts);
                await insertAfter(pointer, content);
                list[1] = content;
            } else {//不需要渲染
                list[1] = null;
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

        const pointer = document.createTextNode('');//指示wiy:for块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        const adjustContent = async (oldContent, newContent, index) => {
            const oldIndex = list.indexOf(oldContent);
            if (oldIndex === index && oldContent === newContent) {//位置没变，内容没变
                return;
            }

            if (oldContent && oldIndex >= 0) {//在for块中
                await remove(oldContent, oldContent != newContent);
                list[oldIndex] = null;
            }

            if (newContent) {
                let prevIndex = index - 1;
                while (prevIndex >= 0) {
                    const prevContent = list[prevIndex];//前一项的内容
                    if (prevContent) {
                        const nodeList = toNodeList(prevContent);
                        for (let i = nodeList.length - 1; i >= 0; i--) {//找到最后一个在dom中的节点
                            const node = nodeList[i];
                            if (node.parentNode === pointer.parentNode || node.isConnected) {//节点没有被移除
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

        const map = {};//之前渲染好的内容map，key是数组或对象的key，value是之前该key对应的数据
        await this.observe(async () => {
            return await this.actual(this.renderValue(forObj, extraContexts));
        }, async (result) => {
            if (_.isNil(result)) {
                return;
            }

            const isArray = Array.isArray(result);

            await this.observe(() => {
                return Object.keys(result);
            }, async (keys) => {
                let index = 0;
                for (let key of keys) {
                    index++;
                    if (isArray) {
                        key = parseInt(key);
                    }

                    const { oldValue, oldContent } = map[key] = map[key] || {};

                    const localContext = tryCreateProxy({
                        [indexName]: index - 1,
                        [keyName]: key,
                    });
                    const newValue = await this.observe(async () => {
                        return await this.actual(result[key]);//这一行是为了观察obj中该key对应的value的变化，这样的话当该key对应的value变化时才能被通知
                    }, (value) => {
                        localContext[valueName] = value;
                        return map[key].oldValue = localContext[valueName];//记录响应式结果
                    }, pointer, `${forObj}[${key}]`);

                    if (newValue === oldValue && oldContent) {//该key对应的value没变，并且有之前渲染好的内容
                        await adjustContent(oldContent, oldContent, index);//只需要调节内容位置
                        continue;
                    }

                    const newContent = await this.renderElement(cloneNode(node, true), [
                        ...extraContexts,
                        localContext,
                    ]);
                    await adjustContent(oldContent, newContent, index);//更新内容
                    map[key].oldContent = newContent;//记录渲染好的内容
                }
                while (index < list.length - 1) {//后续index上原有的内容需要清除
                    index++;
                    await adjustContent(list[index]);//清除内容
                }

                for (let oldKey in map) {//删除原有的多余的key
                    if (!keys.includes(oldKey)) {
                        delete map[oldKey];
                    }
                }
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
            if (node.nodeType === Node.ELEMENT_NODE) {
                node.setAttribute('slot', slotName);
            }
            let slotInfo = slots[slotName] || {};
            slots[slotName] = slotInfo;
            slotInfo = slots[slotName];//获取响应式对象
            slotInfo.assigned = true;

            await this.observe(() => {
                return !!slotInfo.active;
            }, async (active) => {
                if (list[1]) {//有旧内容
                    await remove(list[1]);//移除旧内容
                }

                if (active) {//需要渲染
                    const content = await this.renderNode(cloneNode(node, true), [
                        ...extraContexts,
                        { [dataName]: slotInfo.data },
                    ]);
                    await insertAfter(pointer, content);
                    list[1] = content;
                } else {//不需要渲染
                    list[1] = null;
                }
            }, pointer, `${slotName} active`);
        }, pointer, slot);

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
        const slots = tryCreateProxy({});

        for (let childNode of Array.from(node.childNodes)) {
            childNode._wiySlots = slots;
            if (childNode.nodeType === Node.ELEMENT_NODE) {
                await this.renderElement(childNode, extraContexts);
            } else {
                await this.renderWiySlot(childNode, extraContexts);
            }
        }

        await new Promise(async (resolve) => {
            const define = await loadComponentDefine(this.getComponentConfig(node.nodeName));
            const config = {
                listeners,
                dataBinders,
                slots,
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

        const currentPage = await new Promise(async (resolve) => {
            const showPage = async (page) => {
                if (this._currentPage) {
                    await this._currentPage.remove();
                }

                const element = page._oldElement || document.createElement('wiy-page');
                this._config.container.appendChild(element);
                await page.mount(element);
                resolve(page);
            };

            const define = await loadComponentDefine(this._config.pages[info.path] || this._config.pages[this._config.index]);
            if (define._uuid === this._currentPage?._config._uuid) {
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