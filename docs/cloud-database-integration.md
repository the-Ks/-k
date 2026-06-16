# 云数据库接入说明

当前项目已经预留云数据库接入点，但不会在前端保存数据库地址、账号或密码。

## 原则

- 前端只提交业务申请，例如“新建账号申请”。
- 后端负责校验、加密密码、写入云数据库。
- 云数据库连接信息只放在后端环境变量或配置中心。
- 所有账号、权限、规则变更都要写操作日志。

## 新建账号流程

```text
超级管理员点击新建账号申请
-> 前端提交 /api/accounts/request
-> 后端校验账号是否重复
-> 后端写入云数据库 system_user / user_role
-> 记录 operation_log
-> 返回创建结果
```

当前轻量版中：

```text
/api/accounts/request
```

只是 mock 接口，返回“等待写入云数据库”。

后续替换位置：

```text
backend/src/services/dataSource.js
createAccountRequest()
```

## 云数据库建议表

- `system_user`：系统登录账号
- `role`：角色
- `permission`：权限点
- `user_role`：用户角色关系
- `role_permission`：角色权限关系
- `operation_log`：操作日志

## 后端需要的云数据库配置

建议用环境变量：

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
DB_SSL
```

不要把这些信息写进前端代码。
