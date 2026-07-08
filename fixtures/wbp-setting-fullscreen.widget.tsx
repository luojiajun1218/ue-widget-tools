<Widget name="WBP_Setting">
  <Canvas name="SettingsScreen">
    <Border name="SettingsRoot" fill backgroundColor="panel" padding={[32, 28, 32, 28]}>
      <VerticalBox name="SettingsLayout" fill gap={18}>
        <Text name="SettingsTitleText" text="Settings" variant="title" />
        <Tabs name="SettingsTabs" fill sidebarWidth={220} buttonHeight={52}>
          <Tab id="display" label="Display" buttonName="DisplayTabButton" pageName="DisplayPage">
            <Panel name="DisplayPanel" fill backgroundColor="panel" padding={[24, 22, 24, 22]}>
              <VerticalBox name="DisplayRows" fill gap={12}>
                <SettingRow name="WindowModeRow" label="Window Mode" labelWidth={240} controlFill={true}>
                  <Select name="WindowModeComboBox" options={["Fullscreen", "Borderless", "Windowed"]} />
                </SettingRow>
                <SettingRow name="BrightnessRow" label="Brightness" labelWidth={240} controlFill={true}>
                  <Slider name="BrightnessSlider" value={0.62} />
                </SettingRow>
              </VerticalBox>
            </Panel>
          </Tab>
          <Tab id="audio" label="Audio" buttonName="AudioTabButton" pageName="AudioPage">
            <Panel name="AudioPanel" fill backgroundColor="panel" padding={[24, 22, 24, 22]}>
              <SettingRow name="MasterVolumeRow" label="Master Volume" labelWidth={240} controlFill={true}>
                <Slider name="MasterVolumeSlider" value={0.8} />
              </SettingRow>
            </Panel>
          </Tab>
        </Tabs>
        <HorizontalBox name="SettingsActionRow" gap={14} alignSelf="end">
          <Button name="ResetSettingsButton" text="Reset" variant="secondary" width={128} height={44} />
          <Button name="ApplySettingsButton" text="Apply" variant="primary" width={128} height={44} />
        </HorizontalBox>
      </VerticalBox>
    </Border>
  </Canvas>
</Widget>
