insert into app_menus(menu_id,label,route,sort_order) values
    ('xlog','XLog','/xlog',35)
    ,('logs','실시간 로그','/logs',36);

-- 기존 프로젝트 메뉴 권한을 유지하고 로그 원문은 변경 권한 보유자만 허용
insert into role_menu_permissions(role,menu_id,can_read,can_write)
select role,'xlog',can_read,can_write
from role_menu_permissions where menu_id = 'projects';

insert into role_menu_permissions(role,menu_id,can_read,can_write)
select role,'logs',can_read and can_write,can_write
from role_menu_permissions where menu_id = 'projects';
