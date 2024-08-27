# wiy哲学
- **极简**：抛弃繁琐，直达本质。
- **配置式**：让逻辑隐于配置。
- **模块化**：模板、样式、逻辑、资源，皆可自由拼装。
- **组件化**：组件职责分明，继承与复用，随心所欲。
- **响应式**：数据微动，全局共鸣。
# 起步
创建一个wiy项目：
```shell
npm create @wiyit/wiy
```
上面命令执行后需要设置一个项目名称，然后根据提示进行操作，直到项目创建成功。

假设项目名称为：wiy-example，当项目创建成功后，即可进行后续操作：
```shell
cd wiy-example/
npm install
npm run dev
```
以上命令执行成功后，会自动打开一个浏览器标签页，如果看到“Welcome to wiy!”字样，恭喜你！你的wiy项目启动成功了！
# 能力
## 模板渲染
支持mustache语法模板渲染，支持text节点内容、属性节点内容的渲染。通过双大括号将表达式的值渲染到html中。

提供html：
```html
<div id="{{this.objId}}">{{this.objName}}</div>
```
提供js：
```javascript
export default {
    data: {
        objId: 23,
        objName: '🌏',
    },
}
```
你将得到：
```html
<div id="23">🌏</div>
```
## 条件渲染 wiy:if
支持根据一个条件表达式控制是否渲染。

提供html：
```html
<div wiy:if="this.objId1 < 23">{{this.objName1}}</div>
<div wiy:if="this.objId2 < 23">{{this.objName2}}</div>
```
提供js：
```javascript
export default {
    data: {
        objId1: 22,
        objName1: '🌞',
        objId2: 24,
        objName2: '🌛',
    },
}
```
你将得到：
```html
<div>🌞</div>
```
## 列表渲染 wiy:for
支持根据一个表达式的项目来渲染多项内容。wiy:for支持数组、对象，另外还可通过wiy:for.key和wiy:for.value来自定义key和value的变量名。

提供html：
```html
<div wiy:for="this.objList" wiy:for.key="k" wiy:for.value="v">{{k}}: {{v}}</div>
<br>
<div wiy:for="this.objMap">{{key}}: {{value}}</div>
```
提供js：
```javascript
export default {
    data: {
        objList: ['🌌', '🌞', '🌏', '🌛', '🪐', '🌟', '🌠'],
        objMap: {
            a: '🌌',
            b: '🌞',
            c: '🌏',
            d: '🌛',
            e: '🪐',
            f: '🌟',
            g: '🌠',
        },
    },
}
```
你将得到：
```html
<div>0: 🌌</div>
<div>1: 🌞</div>
<div>2: 🌏</div>
<div>3: 🌛</div>
<div>4: 🪐</div>
<div>5: 🌟</div>
<div>6: 🌠</div>
<br>
<div>a: 🌌</div>
<div>b: 🌞</div>
<div>c: 🌏</div>
<div>d: 🌛</div>
<div>e: 🪐</div>
<div>f: 🌟</div>
<div>g: 🌠</div>
```
## 事件绑定 wiy:onxxxx
支持给标签绑定事件。wiy:on后紧跟事件类型，不区分大小写。支持原生事件及组件自定义事件，支持内联表达式或函数引用。

提供html：
```html
<button wiy:onclick="this.currentObjIndex = (this.currentObjIndex + 1) % this.objList.length">
    {{this.objList[this.currentObjIndex]}}
</button>
<button wiy:onclick="this.onButtonClick">
    {{this.objList[this.currentObjIndex]}}
</button>
```
提供js：
```javascript
'🌌🌞🌏🌛🪐🌟🌠';
export default {
    data: {
        objList: ['🌌', '🌞', '🌏', '🌛', '🪐', '🌟', '🌠'],
        currentObjIndex: 0,
    },
    methods: {
        onButtonClick() {
            this.currentObjIndex = (this.currentObjIndex + 1) % this.objList.length
        },
    },
};          
```
你将得到两个按钮，点击任何一个按钮，都会在按钮上轮流展示各个天体：

![image](https://github.com/user-attachments/assets/34867787-9713-4fc2-8e1a-17c97598e948)
## 数据绑定 wiy:data
支持给标签绑定数据。支持原生表单标签（input、textarea、select）及自定义组件，数据为双向绑定。

提供html：
```html
<input wiy:data="this.a1" type="checkbox" />{{this.a1}}
<button wiy:onclick="this.a1 =! this.a1">点我</button>
<hr>
<input wiy:data="this.a2" type="radio" value="1" />{{this.a2}}
<button wiy:onclick="this.a2 =! this.a2">点我</button>
<hr>
<input wiy:data="this.a3" type="text" />{{this.a3}}
<button wiy:onclick="this.a3 += '🌏'">点我</button>
<hr>
<textarea wiy:data="this.a4"></textarea>
<pre>{{this.a4}}</pre>
<button wiy:onclick="this.a4 += '🌏'">点我</button>
<hr>
<select wiy:data="this.a5">
    <option value="">请选择：</option>
    <option value="1">一</option>
    <option value="2">二</option>
    <option value="3">三</option>
</select>{{this.a5}}
<button wiy:onclick="this.a5 = this.a5 % 3 + 1">点我</button>
```
提供js：
```javascript
'🌌🌞🌏🌛🪐🌟🌠';
export default {
    data: {
        a1: false,
        a2: true,
        a3: '🌞',
        a4: '🌏\n🌛\n🪐\n🌟',
        a5: 2,
    },
};          
```
你将得到多个表单标签，其数据实现了双向绑定：

![image](https://github.com/user-attachments/assets/ff0372c5-ef47-48e8-8e93-36b1616f47a8)
## 响应式更新
## 数据观察器
## 事件机制
## 模板管理
支持引入模板。只需要在逻辑中配置模板文件的引入路径，即可使用该模板进行渲染。需要使用wiy-cli构建项目。

提供js：
```javascript
export default {
    template: import('./template.html'),
}
```
## 样式管理
支持引入样式。只需要在逻辑中配置样式文件的引入路径，即可将样式应用于模板。需要使用wiy-cli构建项目。

提供js：
```javascript
export default {
    style: import('./style.css'),
}
```
## 组件生命周期
## 组件继承
## 路由
## 插件

