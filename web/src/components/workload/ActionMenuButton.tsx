import { Dropdown, Spin, type MenuProps } from 'antd';

type ActionMenuButtonProps = {
  menu: MenuProps;
  loading?: boolean;
};

export function ActionMenuButton({ menu, loading = false }: ActionMenuButtonProps) {
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Dropdown trigger={['click']} menu={menu}>
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus:outline-none"
          aria-label="操作"
        >
          <span>操作</span>
          {loading ? <span className="ml-2"><Spin size="small" /></span> : null}
        </button>
      </Dropdown>
    </div>
  );
}
