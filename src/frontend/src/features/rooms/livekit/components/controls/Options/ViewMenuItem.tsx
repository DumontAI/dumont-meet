import { RiArrowRightSLine, RiLayoutGridLine } from '@remixicon/react'
import {
  Menu as RACMenu,
  MenuItem,
  MenuSection,
  SubmenuTrigger,
  type Selection,
} from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { Box } from '@/primitives'
import { menuRecipe } from '@/primitives/menuRecipe'
import { Separator } from '@/primitives/Separator'
import { StyledPopover } from '@/primitives/StyledPopover'
import { css } from '@/styled-system/css'
import { type LayoutMode, viewPreferencesStore } from '@/stores/viewPreferences'

const LAYOUT_MODES: LayoutMode[] = ['auto', 'speaker', 'gallery']

export const ViewMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items.view' })
  const { layoutMode, hideSelfView, hideNonVideo } =
    useSnapshot(viewPreferencesStore)
  const itemClass = menuRecipe({ variant: 'dark', extraPadding: true }).item

  const hideKeys = [
    ...(hideSelfView ? ['hideSelfView'] : []),
    ...(hideNonVideo ? ['hideNonVideo'] : []),
  ]

  const onHideChange = (keys: Selection) => {
    viewPreferencesStore.hideSelfView =
      keys === 'all' || keys.has('hideSelfView')
    viewPreferencesStore.hideNonVideo =
      keys === 'all' || keys.has('hideNonVideo')
  }

  return (
    <SubmenuTrigger>
      <MenuItem className={menuRecipe({ icon: true, variant: 'dark' }).item}>
        <RiLayoutGridLine size={20} />
        {t('label')}
        <RiArrowRightSLine size={20} className={css({ marginLeft: 'auto' })} />
      </MenuItem>
      <StyledPopover placement="end top">
        <Box size="sm" type="popover" variant="dark">
          <RACMenu style={{ width: '260px' }}>
            <MenuSection
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[layoutMode]}
              onSelectionChange={(keys) => {
                const [mode] = keys === 'all' ? [] : [...keys]
                if (mode) viewPreferencesStore.layoutMode = mode as LayoutMode
              }}
            >
              {LAYOUT_MODES.map((mode) => (
                <MenuItem key={mode} id={mode} className={itemClass}>
                  {t(`layout.${mode}`)}
                </MenuItem>
              ))}
            </MenuSection>
            <Separator />
            <MenuSection
              selectionMode="multiple"
              selectedKeys={hideKeys}
              onSelectionChange={onHideChange}
            >
              <MenuItem id="hideSelfView" className={itemClass}>
                {t('hideSelfView')}
              </MenuItem>
              <MenuItem id="hideNonVideo" className={itemClass}>
                {t('hideNonVideo')}
              </MenuItem>
            </MenuSection>
          </RACMenu>
        </Box>
      </StyledPopover>
    </SubmenuTrigger>
  )
}
